import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CreateFormDto } from "./dto/create-form.dto";
import { CreateFormFieldDto, UpdateFormFieldDto } from "./dto/form-field.dto";
import { CreateFormStepDto, UpdateFormStepDto } from "./dto/form-step.dto";
import { ReorderDto } from "./dto/reorder.dto";
import { UpdateFormDto } from "./dto/update-form.dto";
import { FormsService } from "./forms.service";

// Form builder générique (section 30 du prompt) : formulaires, étapes et
// champs sont des données en base, jamais des composants React codés en
// dur par service.
@ApiTags("forms")
@ApiBearerAuth()
@Controller()
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get("forms")
  @RequirePermissions("forms.read")
  list() {
    return this.formsService.list();
  }

  @Get("forms/:id")
  @RequirePermissions("forms.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.formsService.findById(id);
  }

  @Post("forms")
  @RequirePermissions("forms.manage")
  create(@Body() dto: CreateFormDto) {
    return this.formsService.create(dto);
  }

  @Patch("forms/:id")
  @RequirePermissions("forms.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateFormDto) {
    return this.formsService.update(id, dto);
  }

  @Post("forms/:formId/steps")
  @RequirePermissions("forms.manage")
  createStep(
    @Param("formId", ParseUUIDPipe) formId: string,
    @Body() dto: CreateFormStepDto,
  ) {
    return this.formsService.createStep(formId, dto);
  }

  @Patch("forms/:formId/steps/:stepId")
  @RequirePermissions("forms.manage")
  updateStep(
    @Param("formId", ParseUUIDPipe) formId: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateFormStepDto,
  ) {
    return this.formsService.updateStep(formId, stepId, dto);
  }

  @Delete("forms/:formId/steps/:stepId")
  @HttpCode(204)
  @RequirePermissions("forms.manage")
  async deleteStep(
    @Param("formId", ParseUUIDPipe) formId: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
  ): Promise<void> {
    await this.formsService.deleteStep(formId, stepId);
  }

  @Post("forms/:formId/steps/reorder")
  @HttpCode(204)
  @RequirePermissions("forms.manage")
  async reorderSteps(
    @Param("formId", ParseUUIDPipe) formId: string,
    @Body() dto: ReorderDto,
  ): Promise<void> {
    await this.formsService.reorderSteps(formId, dto.orderedIds);
  }

  @Post("forms/:formId/steps/:stepId/fields")
  @RequirePermissions("forms.manage")
  createField(
    @Param("formId", ParseUUIDPipe) formId: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
    @Body() dto: CreateFormFieldDto,
  ) {
    return this.formsService.createField(formId, stepId, dto);
  }

  @Patch("forms/:formId/steps/:stepId/fields/:fieldId")
  @RequirePermissions("forms.manage")
  updateField(
    @Param("formId", ParseUUIDPipe) formId: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
    @Param("fieldId", ParseUUIDPipe) fieldId: string,
    @Body() dto: UpdateFormFieldDto,
  ) {
    return this.formsService.updateField(formId, stepId, fieldId, dto);
  }

  @Delete("forms/:formId/steps/:stepId/fields/:fieldId")
  @HttpCode(204)
  @RequirePermissions("forms.manage")
  async deleteField(
    @Param("formId", ParseUUIDPipe) formId: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
    @Param("fieldId", ParseUUIDPipe) fieldId: string,
  ): Promise<void> {
    await this.formsService.deleteField(formId, stepId, fieldId);
  }

  @Post("forms/:formId/steps/:stepId/fields/reorder")
  @HttpCode(204)
  @RequirePermissions("forms.manage")
  async reorderFields(
    @Param("formId", ParseUUIDPipe) formId: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
    @Body() dto: ReorderDto,
  ): Promise<void> {
    await this.formsService.reorderFields(formId, stepId, dto.orderedIds);
  }
}
