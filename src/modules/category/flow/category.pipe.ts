import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common';
import { CategoryInput } from '../model';

export class CategoryPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<CategoryInput>({
            name: Joi.string().required().max(100).messages({
                'string.empty': 'Category name cannot be empty',
                'string.max': 'Category name cannot exceed 100 characters',
                'any.required': 'Category name is required',
            }),

            productIds: Joi.array().items(Joi.number().integer()).optional().messages({
                'array.base': 'Product IDs must be an array',
                'number.base': 'Each product ID must be a number',
                'number.integer': 'Each product ID must be an integer',
            }),
        });
    }
}
