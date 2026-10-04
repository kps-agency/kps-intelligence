import { Module } from "@nestjs/common";
import { CompanyModule } from "../company/company.module";
import { EmailModule } from "../email/email.module";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

@Module({
  imports: [CompanyModule, EmailModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
