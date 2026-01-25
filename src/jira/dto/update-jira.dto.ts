import { PartialType } from '@nestjs/mapped-types';
import { CreateJiraDto } from './create-jira.dto';

export class UpdateJiraDto extends PartialType(CreateJiraDto) {}
