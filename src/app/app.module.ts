import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

/** COMPONENTS */
import { AppComponent } from './app.component';
import {
  ConnectComponent,
  ConnectModal,
} from './_components/connect/connect.component';
import { ConfimSendComponent } from './_components/user-settings/user-settings-dialog/confim-send/confim-send.component';
// import { ConnectErrorComponent } from './_components/connect/connect-error/connect-error.component';
import { HeaderComponent } from './_components/header/header.component';
// import { KeystoreConnectComponent } from './_components/connect/keystore-connect/keystore-connect.component';
import { LastBlockIndicatorComponent } from './_components/last-block-indicator/last-block-indicator.component';
// import { LedgerConnectComponent } from './_components/connect/ledger-connect/ledger-connect.component';
import { KeystoreCreateComponent } from './_components/connect/keystore-create/keystore-create.component';
import { PendingTxsModalComponent } from './_components/user-settings/user-settings-dialog/pending-txs/pending-txs-modal.component';
import { UserAddressComponent } from './_components/user-settings/user-settings-dialog/user-address/user-address.component';
import { UserSettingsComponent } from './_components/user-settings/user-settings.component';
import { UserSettingsDialogComponent } from './_components/user-settings/user-settings-dialog/user-settings-dialog.component';
import { ReconnectDialogComponent } from './_components/reconnect-dialog/reconnect-dialog.component';
import { SlippageToleranceComponent } from './_components/slippage-tolerance/slippage-tolerance.component';
import { TestnetWarningComponent } from './_components/testnet-warning/testnet-warning.component';
import { UserAssetComponent } from './_components/user-settings/user-settings-dialog/user-asset/user-asset.component';
import { SendAssetComponent } from './_components/user-settings/user-settings-dialog/send-asset/send-asset.component';
import { UserAddressAddTokenComponent } from './_components/user-settings/user-settings-dialog/user-address-add-token/user-address-add-token.component';
import { NativeRunePromptModalComponent } from './_components/native-rune-prompt/native-rune-prompt-modal/native-rune-prompt-modal.component';

/** MODULES */
import { AppRoutingModule } from './app-routing.module';
import { AssetsListModule } from './_components/assets-list/assets-list.module';
import { AssetInputModule } from './_components/asset-input/asset-input.module';
import { TransactionProcessingModalModule } from './_components/transaction-processing-modal/transaction-processing-modal.module';
import { DirectivesModule } from './_directives/directives.module';
import { ArrowModule } from './_components/arrow/arrow.module';
import { TextFieldModule } from './_components/text-field/text-field.module';
import { BreadcrumbModule } from './_components/breadcrumb/breadcrumb.module';
import { TagModule } from './_components/tag/tag.module';
import { PhraseWordsListModule } from './_components/phrase-words-list/phrase-words-list.module';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';

/** SERVICES */
import { BinanceService } from './_services/binance.service';
import { ExplorerPathsService } from './_services/explorer-paths.service';
import { LastBlockService } from './_services/last-block.service';
import { MidgardService } from './_services/midgard.service';
import { UserService } from './_services/user.service';
import { TransactionStatusService } from './_services/transaction-status.service';
import { KeystoreService } from './_services/keystore.service';
import { SlippageToleranceService } from './_services/slippage-tolerance.service';
import { CoinGeckoService } from './_services/coin-gecko.service';
import { CopyService } from './_services/copy.service';
import { EthUtilsService } from './_services/eth-utils.service';
import { TransactionUtilsService } from './_services/transaction-utils.service';
import { KeystoreDepositService } from './_services/keystore-deposit.service';
import { NetworkQueueService } from './_services/network-queue.service';
import { ThorchainRpcService } from './_services/thorchain-rpc.service';
import { CurrencyService } from './_services/currency.service';
import { MockClientService } from './_services/mock-client.service';
import { MetamaskService } from './_services/metamask.service';

/** MATERIAL */
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

/** EXTERNAL */
import { QRCodeModule } from 'angularx-qrcode';
import { ViewPhraseComponent } from './_components/user-settings/user-settings-dialog/view-phrase/view-phrase.component';
import { DepositComponent } from './_components/user-settings/user-settings-dialog/deposit/deposit.component';
import { DepositConfirmComponent } from './_components/user-settings/user-settings-dialog/deposit/deposit-confirm/deposit-confirm.component';
import { DepositFormComponent } from './_components/user-settings/user-settings-dialog/deposit/deposit-form/deposit-form.component';
import { TransactionSuccessModalModule } from './_components/transaction-success-modal/transaction-success-modal.module';
import { NativeRunePromptModule } from './_components/native-rune-prompt/native-rune-prompt.module';
import { UpgradeRuneModule } from './_components/upgrade-rune/upgrade-rune.module';
import { UpgradeRuneConfirmModule } from './_components/upgrade-rune-confirm/upgrade-rune-confirm.module';
import { SochainService } from './_services/sochain.service';
import { NoticeModule } from './_components/notice/notice.module';
import { AccountSettingsComponent } from './_components/account-settings/account-settings.component';
import { SeedPhraseComponent } from './_components/account-settings/seed-phrase/seed-phrase.component';
import { ThorchainPricesService } from './_services/thorchain-prices.service';
import { HaskoinService } from './_services/haskoin.service';
import { ModalSectionHeaderModule } from './_components/modal-section-header/modal-section-header.module';
import { ReconnectXDEFIDialogComponent } from './_components/reconnect-xdefi-dialog/reconnect-xdefi-dialog.component';
import { KeystoreCreateStorePhraseComponent } from './_components/connect/keystore-create-store-phrase/keystore-create-store-phrase.component';
import { from } from 'rxjs';
import { CurrencyConverterComponent } from './_components/account-settings/currency-converter/currency-converter.component';
import { RuneYieldService } from './_services/rune-yield.service';
import { AnalyticsService } from './_services/analytics.service';
import { LayoutObserverService } from './_services/layout-observer.service';
import { FooterMenuComponent } from './_components/footer-menu/footer-menu.component';
import { CustomPipesModule } from './_pipes/custom-pipes.module';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { LanguageLoader } from './_classes/translate-loader';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    // ConnectComponent,
    // ConnectModal,
    // KeystoreConnectComponent,
    // ConnectErrorComponent,
    LastBlockIndicatorComponent,
    // KeystoreCreateComponent,
    UserSettingsComponent,
    UserSettingsDialogComponent,
    PendingTxsModalComponent,
    UserAddressComponent,
    UserAssetComponent,
    SendAssetComponent,
    ConfimSendComponent,
    ReconnectDialogComponent,
    ReconnectXDEFIDialogComponent,
    SlippageToleranceComponent,
    TestnetWarningComponent,
    ViewPhraseComponent,
    DepositComponent,
    DepositConfirmComponent,
    DepositFormComponent,
    UserAddressAddTokenComponent,
    AccountSettingsComponent,
    SeedPhraseComponent,
    CurrencyConverterComponent,
    FooterMenuComponent,
    // KeystoreCreateStorePhraseComponent,
  ],
  imports: [
    AssetInputModule,
    AssetsListModule,
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    HttpClientModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatDialogModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSliderModule,
    MatSnackBarModule,
    NativeRunePromptModule,
    TransactionProcessingModalModule,
    UpgradeRuneModule,
    UpgradeRuneConfirmModule,
    QRCodeModule,
    AppRoutingModule,
    TransactionSuccessModalModule,
    DirectivesModule,
    ArrowModule,
    TextFieldModule,
    BreadcrumbModule,
    TagModule,
    NoticeModule,
    NativeRunePromptModule,
    ModalSectionHeaderModule,
    PhraseWordsListModule,
    CustomPipesModule,
    HttpClientModule,
    AngularSvgIconModule.forRoot(),
    TranslateModule.forRoot({
      loader: { provide: TranslateLoader, useClass: LanguageLoader },
      defaultLanguage: 'en',
    }),
  ],
  providers: [
    BinanceService,
    CoinGeckoService,
    CopyService,
    KeystoreService,
    UserService,
    MidgardService,
    LastBlockService,
    ExplorerPathsService,
    SlippageToleranceService,
    TransactionStatusService,
    EthUtilsService,
    SochainService,
    ThorchainPricesService,
    HaskoinService,
    TransactionUtilsService,
    KeystoreDepositService,
    NetworkQueueService,
    ThorchainRpcService,
    CurrencyService,
    RuneYieldService,
    AnalyticsService,
    MetamaskService,
    MockClientService,
    LayoutObserverService,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
