import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import type { AuthenticatedUser } from "../users/users.types";
import { UpdateWorkflowDto } from "./dto/update-workflow.dto";
import { ACTION_TYPES, CONDITION_FIELDS } from "./workflow-definition";
import { WorkflowsService } from "./workflows.service";

// Pas de création ni de suppression : les workflows livrés portent des
// règles métier dont l'application dépend (section 46 : une interface de
// création viendra plus tard). Ils sont activables et paramétrables.
@ApiTags("workflows")
@ApiBearerAuth()
@Controller("workflows")
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  @RequirePermissions("workflows.read")
  list() {
    return this.workflowsService.list();
  }

  // Vocabulaire autorisé (champs, actions) avec leurs libellés : l'interface
  // l'affiche sans le redéfinir. Déclaré avant ":id".
  @Get("vocabulary")
  @RequirePermissions("workflows.read")
  vocabulary() {
    return {
      fields: Object.entries(CONDITION_FIELDS).map(([key, field]) => ({ key, ...field })),
      actions: Object.entries(ACTION_TYPES).map(([type, action]) => ({
        type,
        label: action.label,
        params: action.params,
      })),
    };
  }

  @Get(":id")
  @RequirePermissions("workflows.read")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.workflowsService.findById(id);
  }

  @Get(":id/runs")
  @RequirePermissions("workflows.read")
  runs(@Param("id", ParseUUIDPipe) id: string) {
    return this.workflowsService.runs(id);
  }

  @Put(":id")
  @RequirePermissions("workflows.manage")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowsService.update(id, dto, user.id);
  }
}
