import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AssetInputComponent } from './asset-input.component';
import { MarketsModalModule } from '../markets-modal/markets-modal.module';

/** MATERIAL */
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { IconTickerModule } from '../icon-ticker/icon-ticker.module';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TagModule } from '../tag/tag.module';
import { TargetAddressComponent } from './target-address/target-address.component';
import { SelectAssetComponent } from './select-asset/select-asset.component';

@NgModule({
  declarations: [AssetInputComponent, TargetAddressComponent, SelectAssetComponent],
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MarketsModalModule,
    IconTickerModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TagModule,
  ],
  exports: [AssetInputComponent],
})
export class AssetInputModule {}
