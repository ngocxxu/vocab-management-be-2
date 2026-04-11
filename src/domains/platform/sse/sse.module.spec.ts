import { Test, TestingModule } from '@nestjs/testing';
import { SSEController } from './controllers';
import { SSEService, SSEPublisherService } from './services';
import { SSEModule } from './sse.module';

describe('SSEModule', () => {
    let module: TestingModule;

    beforeEach(async () => {
        module = await Test.createTestingModule({
            imports: [SSEModule],
        }).compile();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    it('should have SSEController defined', () => {
        const controller = module.get<SSEController>(SSEController);
        expect(controller).toBeDefined();
    });

    it('should have SSEService defined', () => {
        const service = module.get<SSEService>(SSEService);
        expect(service).toBeDefined();
    });

    it('should have SSEPublisherService defined', () => {
        const publisher = module.get<SSEPublisherService>(SSEPublisherService);
        expect(publisher).toBeDefined();
    });
});
