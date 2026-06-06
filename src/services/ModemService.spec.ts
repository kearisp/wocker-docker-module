import {describe, beforeEach, it, expect} from "@jest/globals";
import Modem from "docker-modem";
import {ApplicationContext, ProcessService} from "@wocker/core";
import {Test, ProcessMockService} from "@wocker/testing";
import {ModemService} from "./ModemService";
import {DockerService} from "./DockerService";
import {ProtoService} from "./ProtoService";
import {ContainerService} from "./ContainerService";
import {ImageService} from "./ImageService";
import {ModemMockService} from "../../test/services/ModemMockService";


describe("ModemService", (): void => {
    let context: ApplicationContext;

    beforeEach(async () => {
        context = await Test
            .createTestingModule({
                providers: [
                    ModemService,
                    ProtoService,
                    DockerService,
                    ContainerService,
                    ImageService
                ]
            })
            .overrideProvider(ProcessService).useProvider(ProcessService)
            .overrideProvider(ModemService).useProvider(ModemMockService)
            .build();
    });

    it("should...", async (): Promise<void> => {
        const dockerService = context.get(DockerService),
              modemService = context.get(ModemService),
              processService = context.get(ProcessMockService);

        await dockerService.pullImage("php:8.3-apache");

        expect(modemService.modem).toBeInstanceOf(Modem);
    });
});
