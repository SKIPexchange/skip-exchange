import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BreadcrumbComponent } from './breadcrumb.component';
import { RouterModule } from '@angular/router';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { LanguageLoader } from 'src/app/_classes/translate-loader';

@NgModule({
  declarations: [BreadcrumbComponent],
  imports: [CommonModule, RouterModule, TranslateModule],
  exports: [BreadcrumbComponent],
})
export class BreadcrumbModule {}
