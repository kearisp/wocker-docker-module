import {HttpMethod} from "../types/HttpMethod";


export class Request {
    public constructor(
        public readonly method: HttpMethod,
        public readonly path: string,
        public readonly params: Record<string, any>,
        public readonly body: any,
        public readonly options: any
    ) {}
}
