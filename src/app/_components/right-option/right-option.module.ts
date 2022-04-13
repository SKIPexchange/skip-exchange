import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RightOptionComponent } from './right-option.component';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  declarations: [RightOptionComponent],
  imports: [CommonModule, MatIconModule, RouterModule, TranslateModule],
  exports: [RightOptionComponent],
})
export class RightOptionModule {}
