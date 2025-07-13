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

type TSubject = {
    name: string;
};

const wordTypeData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data/wordTypes.json'), 'utf-8'),
) as TWordType[];

const languageData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data/languages.json'), 'utf-8'),
) as TLanguage[];

const subjectData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data/subjects.json'), 'utf-8'),
) as TSubject[];

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

    public async seedSubjects() {  
        this.logger.log('Seeding subjects...');

        for (const [index, subject] of subjectData.entries()) {
            const created = await this.prisma.subject.upsert({
                where: { name: subject.name },
                update: {
                    name: subject.name,
                    order: index + 1,
                },
                create: {
                    name: subject.name,
                    order: index + 1,
                },
            });

            this.logger.log(`Created/Updated subject: ${created.name}`);
        }

        this.logger.log('Subjects seeding completed!');
    }

    public async run() {
        try {
            await this.seedWordTypes();
            await this.seedLanguages();
            await this.seedSubjects();
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
