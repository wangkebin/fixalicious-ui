import { Injectable } from '@angular/core';
import { Http, Headers, Response } from '@angular/http';
import { ApiService } from "./api.service";
import { ITransaction } from "../types"

@Injectable()
export class ScenarioService {
    private code: string;
    private template: any;
    private isEnabled: boolean;

    constructor(
        private apiService: ApiService,
        private http: Http) {
        this.template = {};
    }

    public enable(isEnabled) {
        this.isEnabled = isEnabled;
    }

    public saveScenario(scenario: any) {
        let url = "/scenario/" + encodeURI(scenario.label);
        return this.http.post(url, scenario);
    }

    public deleteScenario(scenario: any) {
        let url = "/scenario/" + encodeURI(scenario.label);
        return this.http.delete(url);
    }

    public getAll(){        
        return this.http.get("/scenario")
            .map(res => res.json());
    }

    // shouldn't need anything below

    public setTemplate(template) {
        this.template = template;
    }

    public run(txn: ITransaction) {
        if (!this.isEnabled) {
            return;
        }

        let send = (fix) => {
            this.apiService.createTransaction("BAXA", fix);
        }

        let fixToSend = {
            "OrderID":"fix-2017062600E0",
            "ClOrdID":"2017062600E0",
            "ExecID":"45KU9SW9FZ5","ExecTransType":"0",
            "ExecType":"0","OrdStatus":"0","Symbol":"UPS",
            "SecurityExchange":"New York","Side":"1",
            "OrderQty":"300","OrdType":"1","Price":"4.6",
            "TimeInForce":"0","LastShares":"0","LastPx":"4.4",
            "LeavesQty":"0","CumQty":"300","AvgPx":"4.5",
            "TransactTime":"now","HandlInst":"3"};


        let prefix = "var source = " + JSON.stringify(txn) + "\n\n";

        eval(prefix + this.code);
    }
}