import {describe, it, expect, beforeEach, afterEach, jest} from "@jest/globals";
import {FileSystem, ApplicationContext, ProcessService} from "@wocker/core";
import {Test} from "@wocker/testing";
import {ModemMock, Fixtures} from "docker-modem-mock";
import {ModemService} from "./ModemService";
import {ROOT_DIR} from "../env";
import {ImageService} from "./ImageService";
import {ContainerService} from "./ContainerService";
import {ProtoService} from "./ProtoService";


describe("ContainerService", () => {
    const fs = new FileSystem(`${ROOT_DIR}/fixtures`),
          fixtures = Fixtures.fromFS(fs);

    let context: ApplicationContext;

    beforeEach(async () => {
        class TestModemService extends ModemService {
            protected _modem?: ModemMock;

            public get modem(): ModemMock {
                if(!this._modem) {
                    this._modem = new ModemMock({
                        mockFixtures: fixtures
                    });
                }

                return this._modem;
            }
        }

        context = await Test
            .createTestingModule({
                providers: [
                    ContainerService,
                    ImageService,
                    ModemService,
                    ProtoService
                ]
            })
            .overrideProvider(ModemService).useProvider(TestModemService)
            .build();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it("should create container", async () => {
        const processService = context.get(ProcessService),
              containerService = context.get(ContainerService);

        expect(containerService).toBeInstanceOf(ContainerService);

        let data = "";

        processService.stdout.on("data", (chunk) => {
            data += chunk.toString();
        });

        const container = await containerService.create({
            name: "Test",
            image: "php:8.3-apache"
        });

        expect(data).toContain("Downloaded newer image for php:8.3-apache");

        const inspect = await container.inspect();

        expect(inspect.Name).toBe("/Test");
    });
});
