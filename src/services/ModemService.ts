import {
    Injectable,
    ModemService as CoreModemService,
    LogService
} from "@wocker/core";
import type Modem from "docker-modem";
import type Docker from "dockerode";
import {formatSizeUnits} from "../utils/formatSizeUnits";
import {ProtoService} from "./ProtoService";


@Injectable("DOCKER_MODEM_SERVICE")
export class ModemService extends CoreModemService {
    protected _modem?: Modem;
    protected _docker?: Docker;

    public constructor(
        protected readonly protoService: ProtoService,
        protected readonly logService: LogService
    ) {
        super();
    }

    public get modem(): Modem {
        if(!this._modem) {
            const Modem = require("docker-modem");

            this._modem = new Modem({
                socketPath: "/var/run/docker.sock"
            });
        }

        return this._modem!;
    }

    public get docker(): Docker {
        if(!this._docker) {
            const Docker = require("dockerode");

            this._docker = new Docker({
                modem: this.modem
            });
        }

        return this._docker!;
    }

    public async attachStream(stream: NodeJS.ReadWriteStream): Promise<NodeJS.ReadWriteStream> {
        if(process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        process.stdin.resume();
        process.stdin.setEncoding("utf8");
        process.stdin.pipe(stream);

        stream.setEncoding("utf8");
        stream.pipe(process.stdout);

        try {
            await new Promise<void>((resolve, reject) => {
                stream.on("end", resolve);
                stream.on("error", reject);
            });
        }
        finally {
            process.stdin.pause();

            if(process.stdin.isTTY) {
                process.stdin.setRawMode(false);
            }

            process.stdin.unpipe(stream);

            stream.unpipe(process.stdout);
        }

        return stream;
    }

    public async followProgress(stream: NodeJS.ReadableStream): Promise<void> {
        let isEnded = false,
            line = 0;

        const mapLines: ({
            [id: string]: number;
        }) = {};

        const renderProgressBar = (current: number, total: number, width: number): string => {
            const currentWidth = total > 0 ? Math.floor(width * (current / total)) : 0;
            return "█".repeat(currentWidth) + "░".repeat(Math.max(0, width - currentWidth));
        };

        const renderLine = (id: string, status: string, current?: number, total?: number) => {
            if(typeof mapLines[id] === "undefined") {
                mapLines[id] = line;
                line++;
            }

            const targetLine = mapLines[id];
            const dy = line - targetLine - 1;

            if(dy > 0) {
                process.stdout.write("\x1b[s");
                process.stdout.write(`\x1b[${dy}A`);
            }

            process.stdout.write("\x1b[2K\r");

            let str = `${id}: ${status}`;

            if(typeof current !== "undefined" && typeof total !== "undefined") {
                const terminalWidth = process.stdout.columns || 80;
                const sizeStr = `${formatSizeUnits(current)}/${formatSizeUnits(total)}`;
                const barWidth = terminalWidth - id.length - status.length - sizeStr.length - 10;

                if(barWidth > 10) {
                    str = `${id}: ${status} [${renderProgressBar(current, total, barWidth)}] ${sizeStr}`;
                }
                else {
                    str = `${id}: ${status} ${sizeStr}`;
                }
            }

            process.stdout.write(str);

            if(dy > 0) {
                process.stdout.write("\x1b[u");
            }
            else {
                process.stdout.write("\n");
            }
        };

        return new Promise<void>((resolve, reject) => {
            const handleEnd = () => {
                if(!isEnded) {
                    resolve();
                }

                isEnded = true;
            };

            stream.on("data", (chunk: Buffer) => {
                const text = chunk.toString().replace(/}\s*\{/g, "},{"),
                      items: any[] = JSON.parse(`[${text}]`);

                for(const item of items) {
                    if(item.id === "moby.buildkit.trace") {
                        const StatusResponse = this.protoService.lookupType("moby.buildkit.v1.StatusResponse");

                        const buffer = Buffer.from(item.aux, "base64");
                        const decoded = StatusResponse.decode(buffer);

                        const obj = StatusResponse.toObject(decoded, {
                            enums: String,
                            longs: String,
                            bytes: String,
                            defaults: true
                        }) as {
                            vertexes?: Array<{
                                digest: string;
                                name: string;
                            }>;
                            statuses?: Array<{
                                ID: string;
                                name: string;
                                current: string;
                                total: string;
                            }>;
                            logs?: Array<{
                                msg: string;
                            }>;
                        };

                        if(obj.vertexes) {
                            for(const vertex of obj.vertexes) {
                                if(vertex.name) {
                                    renderLine(vertex.digest.substring(0, 12), vertex.name);
                                }
                            }
                        }

                        if(obj.statuses) {
                            for(const status of obj.statuses) {
                                renderLine(status.ID, status.name, parseInt(status.current), parseInt(status.total));
                            }
                        }

                        if(obj.logs) {
                            for(const log of obj.logs) {
                                const msg = Buffer.from(log.msg, "base64").toString();
                                process.stdout.write(msg);
                                line += msg.split("\n").length - 1;
                            }
                        }
                    }
                    else if(item.id === "moby.image.id") {
                        const str = `Image ID: ${item.aux.ID}`;
                        process.stdout.write(`${str}\n`);
                        line++;
                    }
                    else if(item.stream) {
                        process.stdout.write(`${item.stream}`);
                        line += item.stream.split("\n").length - 1;
                    }
                    else if(item.id) {
                        const {
                            id,
                            status,
                            processDetail: {
                                current,
                                total
                            } = {}
                        } = item;

                        renderLine(id, status, current, total);
                    }
                    else if(typeof item.aux === "object") {
                        const str = `auxID: ${item.aux.ID}`;

                        process.stdout.write(`${str}\n`);

                        line += Math.ceil(str.length / (process.stdout.columns || 80));
                    }
                    else if(item.status) {
                        process.stdout.write(`${item.status}\n`);

                        line += Math.ceil(item.status.length / (process.stdout.columns || 80));
                    }
                    else {
                        console.info("Unexpected data", item);
                    }
                }
            });
            stream.on("end", handleEnd);
            stream.on("close", handleEnd);
            stream.on("error", (err: Error) => {
                reject(err);
            });
        });
    }
}
