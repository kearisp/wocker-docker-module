import {FileSystem} from "@wocker/core";
import {ModemMock, Fixtures} from "docker-modem-mock";
import {ModemService} from "../../src";
import {ROOT_DIR} from "../../src/env";


export class ModemMockService extends ModemService {
    protected _modem?: ModemMock;

    public get modem(): ModemMock {
        if(!this._modem) {
            const fs = new FileSystem(`${ROOT_DIR}/fixtures`),
                  fixtures = Fixtures.fromFS(fs);

            this._modem = new ModemMock({
                mockFixtures: fixtures
            });
        }

        return this._modem;
    }
}
