export class Response {
    protected _status: number = 200;
    protected _body: any;

    public constructor() {}

    public status(status: number): this {
        this._status = status;
        return this;
    }

    public send(body: any): this {
        this._body = body;
        return this;
    }
}
