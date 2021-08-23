import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/** MATERIAL */
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SelectAssetComponent } from './select-asset.component';
import { MarketsModalModule } from '../../markets-modal/markets-modal.module';
import { IconTickerModule } from '../../icon-ticker/icon-ticker.module';

@NgModule({
  declarations: [SelectAssetComponent],
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MarketsModalModule,
    IconTickerModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  exports: [SelectAssetComponent],
})
export class SelectAssetModule {}
