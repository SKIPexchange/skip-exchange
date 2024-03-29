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
import { CustomPipesModule } from 'src/app/_pipes/custom-pipes.module';
import { SelectAssetModule } from './select-asset/select-asset.module';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { LanguageLoader } from 'src/app/_classes/translate-loader';

@NgModule({
  declarations: [AssetInputComponent, TargetAddressComponent],
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MarketsModalModule,
    IconTickerModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TagModule,
    CustomPipesModule,
    SelectAssetModule,
    TranslateModule,
  ],
  exports: [AssetInputComponent],
})
export class AssetInputModule {}
