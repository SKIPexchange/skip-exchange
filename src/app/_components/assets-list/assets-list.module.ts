import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AssetsListComponent } from './assets-list.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { DirectivesModule } from 'src/app/_directives/directives.module';
import { IconTickerModule } from '../icon-ticker/icon-ticker.module';
import { ArrowModule } from '../arrow/arrow.module';
import { ShortPipeModule } from 'src/app/_pipes/short-number.module';

@NgModule({
  declarations: [AssetsListComponent],
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    IconTickerModule,
    ShortPipeModule,
    ArrowModule,
    DirectivesModule,
  ],
  exports: [AssetsListComponent],
})
export class AssetsListModule {}
