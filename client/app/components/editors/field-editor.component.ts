import { Component, OnInit, EventEmitter, Input, Output, SimpleChange } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Http, Response } from "@angular/http";
import { ApiService } from "../../services/api.service"
import { FixParserService } from "../../services/fix-parser.service"
import { ISession, IFixMessage, ITransaction, IPair } from "../../types.d";
import { SetFocusDirective } from "../../directives/set-focus";
import * as io from 'socket.io-client';
import * as _ from "lodash";

@Component({
    selector: 'field-editor',
    templateUrl: "app/components/editors/field-editor.component.html",
    styleUrls: ["app/components/editors/field-editor.component.css"],
    providers: [ApiService]
})
export class FieldEditorComponent implements OnInit {
    @Input() action: any;
    @Input() template: any;
    @Input() level: number = 0;
    @Input() editMode = false;
    @Input() sourceFix: any;
    @Input() session: any;
    @Input() autoSend: boolean;

    constructor(
        private apiService: ApiService,
        private fixParserService: FixParserService) {
    }

    ngOnInit() {
    }

    private ngOnChanges(changes: { [propKey: string]: SimpleChange }) {
        this.evalAll();
        if (this.template && this.template.length === 1 && this.template[0].key === "") {
            this.editMode = true;
        }

        for (let propName in changes) {
            let changedProp = changes[propName];
            if (propName == "action"
                && changedProp.currentValue != undefined
                && this.session
                && this.autoSend) {
                setTimeout(o => {
                    this.send();
                }, 20);
            }
        }
    }

    private cleanupTemplate(template) {
        return _.map(template, o => {
            return {
                key: o.key,
                formula: Array.isArray(o.formula)
                    ? this.cleanupTemplate(o.formula)
                    : o.formula
            };
        });
    }

    private edit() {
        this.editMode = !this.editMode;

        // apply and save
        if (!this.editMode) {
            // Remove all empty ones
            _.remove(this.template, o => o.key === "");

            // save a "cleaned" version
            let actionToSave = {
                label: this.action.label,
                type: this.action.type,
                template: this.cleanupTemplate(this.action.template)
            };

            this.apiService.saveAction(actionToSave).subscribe(o => {
                console.log("Action saved");
            });

            if (this.sourceFix) {
                this.evalAll();
            }
        }
    }

    private evalAll() {
        if (this.template && this.sourceFix) {
            this.template.forEach(element => {
                this.fixParserService.eval(element, this.sourceFix.message);
            });
        }
    }

    private send() {
        let fixToSend = this.fixParserService.mapToSend(this.template);
        console.log(fixToSend);
        this.apiService.createTransaction(this.session.session, fixToSend);
    }

    private leaveValue(pair) {
        // let index = this.template.indexOf(pair);
        // if (index === this.template.length - 1) {
        //     this.insertAtBottom();
        // }
    }

    private insertSubItem(pair) {
        let item = { key: "", formula: "", value: "", focus: false };
        pair.formula.push(item);
        item.focus = true;
    }

    private insertAbove(pair) {
        let index = this.template.indexOf(pair);
        let item = { key: "", formula: "", value: "" };
        this.template.splice(index, 0, item);
    }

    private insertBelow(pair) {
        let index = this.template.indexOf(pair);
        let item = { key: "", formula: "", value: "" };
        this.template.splice(index + 1, 0, item);
    }

    private insertAtBottom() {
        let item = { key: "", formula: "", value: "" };
        this.template.push(item);
    }

    private insertGroup(pair) {
        let index = this.template.indexOf(pair);
        let groupItem = { key: "", value: "", formula: [] };
        this.template.splice(index, 0, groupItem);
    }
    private delete(pair) {
        let index = this.template.indexOf(pair);
        this.template.splice(index, 1);
    }
    private isRepeatingGroup(pair) {
        return Array.isArray(pair.formula);
    }
}
