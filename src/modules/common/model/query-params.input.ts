import { ApiProperty } from '@nestjs/swagger';

export class QueryParamsInput {
  @ApiProperty({ description: 'Page number', example: 1, required: false })
  public page?: number = 1;

  @ApiProperty({ description: 'Page size', example: 10 , required: false})
  public pageSize?: number = 10;

  @ApiProperty({ description: 'Sort by', example: 'createdAt', required: false })
  public sortBy?: string;

  @ApiProperty({ description: 'Sort order', example: 'desc', required: false })
  public sortOrder?: 'asc' | 'desc' = 'desc';
}