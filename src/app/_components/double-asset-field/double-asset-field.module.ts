import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DoubleAssetFieldComponent } from './double-asset-field.component';
import { MarketsModalModule } from '../markets-modal/markets-modal.module';

/** MATERIAL */
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { IconTickerModule } from '../icon-ticker/icon-ticker.module';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TagModule } from '../tag/tag.module';
import { SelectAssetModule } from '../asset-input/select-asset/select-asset.module';
import { AngularSvgIconModule } from 'angular-svg-icon';

@NgModule({
  declarations: [DoubleAssetFieldComponent],
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MarketsModalModule,
    IconTickerModule,
    MatProgressSpinnerModule,
    MatIconModule,
    SelectAssetModule,
    AngularSvgIconModule,
    TagModule,
  ],
  exports: [DoubleAssetFieldComponent],
})
export class DoubleAssetFieldModule {}
