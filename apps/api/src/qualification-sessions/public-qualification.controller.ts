import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { IsBoolean, IsOptional } from "class-validator";
import { SaveFormResponseDto } from "./dto/save-form-response.dto";
import { QualificationSessionsService } from "./qualification-sessions.service";

class SubmitPublicQualificationDto {
  @IsOptional()
  @IsBoolean({ message: "consent doit être un booléen." })
  consent?: boolean;
}

// Page publique de qualification (sections 23-24 du prompt) : aucun
// compte requis, résolution par token uniquement (jamais par id de
// session — un id interne ne doit jamais être exposé/prévisible).
// Consomme le même QualificationSessionsService que le flux
// authentifié — pas de logique dupliquée.
@ApiTags("qualification-public")
@Public()
@Controller("public/qualification")
export class PublicQualificationController {
  constructor(private readonly sessionsService: QualificationSessionsService) {}

  @Get(":token")
  findByToken(@Param("token") token: string) {
    return this.sessionsService.findByToken(token);
  }

  @Put(":token/responses/:fieldKey")
  saveResponse(
    @Param("token") token: string,
    @Param("fieldKey") fieldKey: string,
    @Body() dto: SaveFormResponseDto,
  ) {
    return this.sessionsService.savePublicResponse(token, fieldKey, dto.value);
  }

  @Post(":token/submit")
  submit(@Param("token") token: string, @Body() dto: SubmitPublicQualificationDto) {
    return this.sessionsService.submitPublic(token, dto.consent === true);
  }
}
