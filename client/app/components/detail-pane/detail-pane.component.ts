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
                (click)="toggleExpanded()">>></button>

            <button 
                [ngClass]="(!collapsed && selectedAction==action) ? 'selected' : '' "
                [style.border-color]="(action.invalid) ? 'red' : 'gray' "                
                [title]="(action.invalid) ? action.invalid : '' "
                *ngFor="let action of customActions"
                (click)="activateTemplate(action)"
                class="invalid">
                <input 
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
            >+</button>

        </div>
        <div class="keyvalue-section" [hidden]="collapsed">
            <table class="keyvalue-table">
                <tr>
                    <td colspan=2 
                            [hidden]="!selectedAction">
                        <button class="send" 
                            (click)="send()">Send
                            </button>
                            
                        <button class="send" 
                            (click)="deleteTemplate()">Delete</button>
                            
                        <button class="send" 
                            (click)="copyTemplate()">Copy</button>
                            
                        <button class="send" 
                            (click)="configureTemplate()"
                            [ngClass]="isConfiguring ? 'configure-input' : '' ">Configure</button>
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
    private socket;
    private isAddingAction = false;
    private isConfiguring = false;
    private customActions = [];
    private selectedAction = null;
    private fixFields = ["OrderID", "ClOrdID", "Symbol", "ExecID", "ExecType"];

    constructor(
        private apiService: ApiService,
        private fixParserService: FixParserService) {
        this.isValid = true;
        this.socket = io();

        this.apiService.getTemplates().subscribe(o => {
            this.customActions = o;
            if (this.customActions.length > 0) {
                this.selectedAction = this.customActions[0];
            }
        });

        this.selectedAction = {
            label: "", isEditing: true, pairs: []
        };
    }

    private ngOnChanges(changes: { [propKey: string]: SimpleChange }) {
        for (let propName in changes) {
            let changedProp = changes[propName];

            if (propName == "detail" && changedProp.currentValue != undefined) {
                this.transaction = changedProp.currentValue;
                this.sourceFixObj = this.fixParserService.parseFix(this.transaction.message);
                this.isValid = true;

                if (this.selectedAction) {
                    this.activateTemplate(this.selectedAction);
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
                action.invalid = "Please create a unique name";
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

    private activateTemplate(action) {
        if (this.selectedAction.invalid) {
            return;
        }
        this.isConfiguring = false;
        this.selectedAction = action;

        this.fixToSend = {};
        action.pairs.forEach(element => {
            let resolved = this.fixParserService.eval(element.formula, this.sourceFixObj);
            element.value = resolved;
            this.fixToSend[element.key] = { value: resolved, formula: element.formula };
        });

        this.displayFixMessage();
        if (this.collapsed) {
            this.send();
        }
    }

    private send() {
        let fixObj = this.fixParserService.generateFix(this.selectedAction.pairs);
        this.apiService.createTransaction(this.session.name, fixObj);

        if (!this.collapsed) {
            // set a new ExecID so user can repeated hit send button
            this.fixToSend["ExecID"] = (Math.random().toString(36) + '00000000000000000').slice(2, 11 + 2).toUpperCase();
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
                this.activateTemplate(this.selectedAction);
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
        }
    }

    private getUniqueName(): boolean {
        return true;
    }

    private copyTemplate() {
        let json = JSON.stringify(this.selectedAction);
        let newAction = JSON.parse(json);

        // Add (1), or the next available number
        while (_.find(this.customActions, o => o.label === newAction.label)) {
            let regex = /\(\d+\)$/;
            let matches = newAction.label.match(regex);
            if (matches) { // this already exists, incremenet the number
                let num = matches[0].substring(1, matches[0].length - 1);
                let incNum = parseInt(num) + 1;
                newAction.label = newAction.label.replace(regex, "(" + incNum + ")");
            } else {
                newAction.label += " (1)";
            }
        }

        this.customActions.push(newAction);
    }

    ngOnInit() {
        this.collapsed = localStorage.getItem("detail-pane-collapsed") === "true";
    }

}
