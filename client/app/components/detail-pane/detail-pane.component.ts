import { Component, OnInit, EventEmitter, Input, Output, SimpleChange } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Http, Response } from "@angular/http";
import { ApiService } from "../../services/api.service"
import { FixParserService } from "../../services/fix-parser.service"
import { ISession, IFixMessage, ITransaction } from "../../types.d";
import { SetFocusDirective } from "../../directives/set-focus";
import * as io from 'socket.io-client';
import * as _ from "lodash";

@Component({
    selector: 'detail-pane',
    template: `
    <div class="container" [style.width]="collapsed ? '80px' : '400px'" > 
        <div class="button-section">
            <button 
                class="expander" 
                title="Show the FIX messages to be sent"
                (click)="toggleExpanded()">
                    <i class="fa"
                        style="font-size:20px;"
                        [ngClass]="collapsed ? 'fa-angle-double-left' : 'fa-angle-double-right'"></i>
                </button>

            <button 
                [ngClass]="(!collapsed && selectedAction==action) ? 'selected' : '' "
                [style.border-color]="(action.invalid) ? 'red' : 'gray' "                
                [title]="(action.invalid) ? action.invalid : '' "
                *ngFor="let action of customActions"
                (click)="activateTemplate(action, true)"
                class="invalid">
                <input 
                    maxlength="10"
                    (blur)="doneEditingActionLabel($event, action)"
                    [readonly]="!action.isEditing"
                    [(ngModel)]="action.label"
                    [setFocus]="action.isEditing"
                    (dblclick)="action.isEditing=true"
                    [ngClass]="action.isEditing ? 'editable-input' : 'readonly-input' "
                />
            </button>          

            <button class="add-action"
                title="Add a new quick action button"
                [hidden]="collapsed"
                (click)="addAction()"
                style="color:#777;">
                <i class="fa fa-plus-circle"></i>
            </button>

        </div>
        <div class="keyvalue-section" [hidden]="collapsed">
            <table class="keyvalue-table">
                <tr>
                    <td colspan=3
                        [hidden]="!selectedAction">
                        
                        <button class="template-top" 
                            (click)="send()"
                            title="Send message back to the client">
                            <i class="fa fa-send-o"></i> Send
                            </button>
                            
                        <button class="template-top" 
                            (click)="deleteTemplate()"
                            title="Delete this template">
                            <i class="fa fa-trash-o"></i> Delete
                            </button>
                            
                        <button class="template-top" 
                            (click)="copyTemplate()"
                            title="Create a copy of this template">
                            <i class="fa fa-copy"></i> Copy
                            </button>
                            
                        <button class="template-top" 
                            (click)="configureTemplate()"
                            [class.configure-input]="isConfiguring"
                            title="Edit the keys and default values for each field">
                            <i class="fa fa-pencil"></i> Edit
                            </button>                            
                    </td>
                </tr>
                <tr *ngFor="let pair of selectedAction.pairs"
                    [hidden]="isConfiguring" >
                    <td class="key"><span>{{pair.key}}</span></td>
                    <td class="value">
                        <input 
                            [hidden]="isConfiguring"
                            [(ngModel)]="pair.value"/>
                    </td>
                </tr>
                <tr *ngFor="let pair of selectedAction.pairs" 
                    [hidden]="!isConfiguring">
                    <td class="delete-column">
                        <button class="delete-pair"
                            title="Delete"
                            (click)="deletePair(pair)"
                            style="color:#777;">
                            <i class="fa fa-times"></i>
                        </button>
                    </td>
                    <td class="key">                        
                        <input 
                            class="configure-key"
                            (blur)="doneEditingPair(pair)"
                            [(ngModel)]="pair.key"/>

                    <!--  <select class="configure-input" [(ngModel)]="pair.key">
                            <option *ngFor="let str of fixFields" [value]="str">{{str}}</option>
                        </select> -->
                    <td class="value">
                        <input class="configure-input"                            
                            [(ngModel)]="pair.formula"/>
                    </td>
                </tr>
            </table>
        </div>
    </div>
    `,
    styleUrls: ["app/components/detail-pane/detail-pane.component.css"],
    providers: [ApiService]
})
export class DetailPane implements OnInit {
    @Input() detail: ITransaction;
    @Input() collapsed: boolean = true;
    @Input() session: ISession;

    private transaction: ITransaction;
    private isValid: boolean;
    private sourceFixObj = {};
    private fixToSend = {};
    private isConfiguring = false;
    private customActions = [];
    private selectedAction = null;
    private fixFields = ["OrderID", "ClOrdID", "Symbol", "ExecID", "ExecType"];

    constructor(
        private apiService: ApiService,
        private fixParserService: FixParserService) {
        this.isValid = true;

        this.apiService.getTemplates().subscribe(o => {
            this.customActions = o;
            if (this.customActions.length > 0) {
                this.activateTemplate(this.customActions[0], false);
            }
        });

        this.selectedAction = {
            label: "", isEditing: true, pairs: []
        };
    }

    ngOnInit() {
        this.collapsed = localStorage.getItem("detail-pane-collapsed") === "true";
    }

    private ngOnChanges(changes: { [propKey: string]: SimpleChange }) {
        for (let propName in changes) {
            let changedProp = changes[propName];

            if (propName == "detail" && changedProp.currentValue != undefined) {
                this.transaction = changedProp.currentValue;
                this.sourceFixObj = JSON.parse(this.transaction.message);
                this.isValid = true;

                if (this.selectedAction) {
                    this.activateTemplate(this.selectedAction, false);
                }
            }
            if (propName == "collapsed" && changedProp.currentValue != undefined) {
                this.collapsed = changedProp.currentValue;
            }
        }
    }

    private toggleExpanded() {
        this.collapsed = !this.collapsed;
        localStorage.setItem("detail-pane-collapsed", this.collapsed.toString());
    }

    private addAction() {
        if (this.selectedAction.invalid) {
            return;
        }
        let newAction = {
            label: "", isEditing: true, pairs: [
                { key: "", formula: "" }
            ]
        };
        this.customActions.push(newAction);
    }

    private doneEditingActionLabel($event, action) {
        if (action.isEditing) {
            action.isEditing = false;
            action.invalid = null;

            if (_.countBy(this.customActions, o => o.label.toUpperCase() === action.label.toUpperCase()).true > 1) {
                action.label = this.uniquify(_.map(this.customActions, o => o.label), action.label);
            }

            if (action.label.trim() === "") {
                action.invalid = "Label cannot be empty";
            }

            if (action.invalid) {
                action.isEditing = true;
            } else {
                // save to server
                this.apiService.createTemplate(action).subscribe(o => {
                    this.selectedAction = action;
                    this.isConfiguring = true;
                });
            }
        }
    }

    private activateTemplate(action, autoSend: boolean) {
        if (this.selectedAction.invalid) {
            return;
        }
        if (this.isConfiguring) {
            //finalize and save changes
            this.configureTemplate();
        }

        this.selectedAction = action;

        this.fixToSend = {};
        action.pairs.forEach(element => {
            let resolved = this.fixParserService.eval(element.formula, this.sourceFixObj);
            element.value = resolved;
            this.fixToSend[element.key] = { value: resolved, formula: element.formula };
        });

        this.displayFixMessage();
        if (autoSend && this.collapsed) {
            this.send();
        }
    }

    private send() {
        let fixObj = this.fixParserService.generateFix(this.selectedAction.pairs);
        this.apiService.createTransaction(this.session.session, fixObj);

        if (!this.collapsed) {
            this.displayFixMessage();
        }
    }

    private deleteTemplate() {
        this.apiService.deleteTemplate(this.selectedAction)
            .subscribe(success => {
                let index = this.customActions.indexOf(this.selectedAction);
                _.pull(this.customActions, this.selectedAction);
                if (index > 0) {
                    this.selectedAction = this.customActions[index - 1];
                } else if (index < this.customActions.length) {
                    this.selectedAction = this.customActions[index];
                }
                this.activateTemplate(this.selectedAction, false);
            }, error => {
                console.error("Failed to delete template: " + error);
            });
    }

    private configureTemplate() {
        if (this.isConfiguring) {
            _.pullAt(this.selectedAction.pairs, this.selectedAction.pairs.length - 1);
            this.apiService.createTemplate(this.selectedAction).subscribe(o => {
                console.log("Template saved");
            });
        } else {
            this.selectedAction.pairs.push({
                key: "",
                formula: "",
                value: "",
                isNewItem: true
            });
        }
        this.isConfiguring = !this.isConfiguring;
        this.displayFixMessage();
    }

    private displayFixMessage() {
        this.selectedAction.pairs.forEach(element => {
            let resolved = this.fixParserService.eval(element.formula, this.sourceFixObj);
            element.value = resolved;
        });
    }

    private doneEditingPair(pair) {
        let lastPair = this.selectedAction.pairs[this.selectedAction.pairs.length - 1];
        if (lastPair.key.trim() !== "") {
            pair.isNewItem = false;
            this.selectedAction.pairs.push({
                key: "",
                formula: "",
                value: "",
                isNewItem: true
            });
        } else {
            _.pull(this.selectedAction.pairs, pair);
        }
    }

    private deletePair(pair){
        _.pull(this.selectedAction.pairs, pair);
    }

    private uniquify(allNames: string[], origName: string): string {
        let newName = origName;
        while (_.find(this.customActions, o => o.label === newName)) {
            let regex = /\(\d+\)$/;
            let matches = newName.match(regex);
            if (matches) { // this already exists, incremenet the number
                let num = matches[0].substring(1, matches[0].length - 1);
                let incNum = parseInt(num) + 1;
                newName = newName.replace(regex, "(" + incNum + ")");
            } else {
                newName += " (1)";
            }
        }
        return newName;
    }

    private copyTemplate() {
        let json = JSON.stringify(this.selectedAction);
        let newAction = JSON.parse(json);

        newAction.label = this.uniquify(
            _.map(this.customActions, o => o.label),
            newAction.label);

        this.customActions.push(newAction);
        this.apiService.createTemplate(newAction).subscribe(o => {
            console.log("Template saved");
            this.activateTemplate(newAction, false);
            newAction.isConfiguring = true;
        });
    }
}
