import * as Joi from 'joi';

import { JoiValidationPipe } from '../../common';
import { ProductInput } from '../model';

export class ProductPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<ProductInput>({
            name: Joi.string().required().max(255),
            description: Joi.string().allow('', null),
            price: Joi.number().positive().required(),
            stock: Joi.number().integer().min(0).default(0),
            mainImage: Joi.string().uri().allow('', null),
            categoryId: Joi.number().integer().positive().allow(null),
            attributes: Joi.object({
                material: Joi.string().required(),
                brand: Joi.string().required(),
                origin: Joi.string().allow('', null),
                sizes: Joi.array().items(Joi.string()).allow(null),
            }).allow(null),
        });
    }
}
