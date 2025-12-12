import {Request} from "./Request";
import {Response} from "./Response";
import {HttpMethod} from "../types/HttpMethod";


export type RouteHandler = (req: Request, res: Response) => void|Promise<void>;

export class Router {
    protected routes: {
        method: HttpMethod;
        pattern: string;
        handler: RouteHandler;
    }[] = [];

    protected request(method: HttpMethod, pattern: string | string[], handler: RouteHandler): this {
        if(Array.isArray(pattern)) {
            pattern.forEach((pattern) => {
                this.routes.push({
                    method,
                    pattern,
                    handler
                });
            });
        }
        else {
            this.routes.push({
                method,
                pattern,
                handler
            });
        }

        return this;
    }

    public get(pattern: string | string[], handler: RouteHandler): this {
        return this.request("GET", pattern, handler);
    }

    public post(pattern: string | string[], handler: RouteHandler): this {
        return this.request("POST", pattern, handler);
    }

    public put(pattern: string | string[], handler: RouteHandler): this {
        return this.request("PUT", pattern, handler);
    }

    public patch(pattern: string | string[], handler: RouteHandler): this {
        return this.request("PATCH", pattern, handler);
    }

    public delete(pattern: string | string[], handler: RouteHandler): this {
        return this.request("DELETE", pattern, handler);
    }

    public parseRoute(method: HttpMethod, path: string): [RouteHandler|null, Record<string, any>] {
        for(const route of this.routes) {
            if(route.method !== method) {
                continue;
            }

            const params = this.matchRoute(path, route.pattern);

            if(!params) {
                continue;
            }

            return [route.handler, params];
        }

        return [null, {}];
    }

    protected matchRoute(path: string, pattern: string): Record<string, string> | null {
        const paramMatches = pattern.match(/:[a-zA-Z0-9_]+/g);

        if(!paramMatches) {
            return path === pattern ? {} : null;
        }

        let regexPattern = pattern;
        const paramNames: string[] = [];

        paramMatches.forEach(param => {
            const paramName = param.substring(1);
            paramNames.push(paramName);

            const isLastParam = pattern.indexOf(param) + param.length === pattern.length;

            if(isLastParam) {
                regexPattern = regexPattern.replace(param, "(.+)");
            }
            else {
                const restOfPattern = pattern.substring(pattern.indexOf(param) + param.length);
                const nextFixedPart = restOfPattern.match(/^\/[^:][^\/]*/);

                if(nextFixedPart) {
                    regexPattern = regexPattern.replace(param, "(.+?)");
                }
                else {
                    regexPattern = regexPattern.replace(param, "(.+)");
                }
            }
        });

        const regex = new RegExp(`^${regexPattern}$`);
        const match = path.match(regex);

        if(!match) {
            return null;
        }

        const params: Record<string, string> = {};

        for(let i = 0; i < paramNames.length; i++) {
            params[paramNames[i]] = match[i + 1];
        }

        return params;
    }

    public async exec(method: HttpMethod, path: string, body: any, options: any = {}): Promise<any> {
        const url = new URL(path, "https://localhost"),
              [handler, params] = this.parseRoute(method, url.pathname);

        if(!handler) {
            throw new Error(`Route ${method} ${path} not found`);
        }

        const request = new Request(
            method,
            url.pathname,
            params,
            body,
            options
        );
        const response = new Response();

        await handler(request, response);

        return (response as any)._body;
    }
}
