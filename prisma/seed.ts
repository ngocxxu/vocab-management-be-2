import { Logger, LoggerService } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

type TWordType = {
    name: string;
    description: string;
};

type TLanguage = {
    code: string;
    name: string;
};

const wordTypeData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data/wordTypes.json'), 'utf-8'),
) as TWordType[];

const languageData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data/languages.json'), 'utf-8'),
) as TLanguage[];

export class DatabaseSeeder {
    private readonly prisma: PrismaClient;

    public constructor(private readonly logger: LoggerService) {
        this.prisma = new PrismaClient();
    }

    public async seedWordTypes() {
        this.logger.log('Seeding word types...');

        for (const wordType of wordTypeData) {
            const created = await this.prisma.wordType.upsert({
                where: { name: wordType.name },
                update: {
                    description: wordType.description,
                },
                create: {
                    name: wordType.name,
                    description: wordType.description,
                },
            });

            this.logger.log(`Created/Updated word type: ${created.name}`);
        }

        this.logger.log('Word types seeding completed!');
    }

    public async seedLanguages() {
        this.logger.log('Seeding languages...');

        for (const language of languageData) {
            const created = await this.prisma.language.upsert({
                where: { code: language.code },
                update: {
                    name: language.name,
                },
                create: {
                    name: language.name,
                    code: language.code,
                },
            });

            this.logger.log(`Created/Updated language: ${created.name}`);
        }

        this.logger.log('Languages seeding completed!');
    }

    public async run() {
        try {
            await this.seedWordTypes();
            await this.seedLanguages();
            this.logger.log('Seeding completed successfully!');
        } catch (error) {
            throw error;
        } finally {
            await this.prisma.$disconnect();
        }
    }
}

const loggerService = new Logger('DatabaseSeeder');
const seeder = new DatabaseSeeder(loggerService);
seeder.run().catch(() => {
    process.exit(1);
});
