import { Component, OnDestroy, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import {
  getValueOfAssetInRune,
  getValueOfRuneInAsset,
  PoolData,
} from "@thorchain/asgardex-util";
import {
  baseAmount,
  assetToBase,
  assetAmount,
  baseToAsset,
  assetToString,
} from "@xchainjs/xchain-util";
import { combineLatest, Subscription } from "rxjs";
import { Asset, getChainAsset, isNonNativeRuneToken } from "../_classes/asset";
import { MidgardService } from "../_services/midgard.service";
import { UserService } from "../_services/user.service";
import { MatDialog } from "@angular/material/dialog";
import { ConfirmDepositData } from "./confirm-deposit-modal/confirm-deposit-modal.component";
import { User } from "../_classes/user";
import { Balances } from "@xchainjs/xchain-client";
import { AssetAndBalance } from "../_classes/asset-and-balance";
import { EthUtilsService } from "../_services/eth-utils.service";
import { DepositViews, OverlaysService } from "../_services/overlays.service";
import { ThorchainPricesService } from "../_services/thorchain-prices.service";
import { TransactionUtilsService } from "../_services/transaction-utils.service";
import { debounceTime } from "rxjs/operators";
import { PoolAddressDTO } from "../_classes/pool-address";
import { toLegacyAddress } from '@xchainjs/xchain-bitcoincash';


@Component({
  selector: "app-deposit",
  templateUrl: "./deposit.component.html",
  styleUrls: ["./deposit.component.scss"],
})
export class DepositComponent implements OnInit, OnDestroy {
  /**
   * Rune
   */
  rune: Asset;

  get runeAmount() {
    return this._runeAmount;
  }
  set runeAmount(val: number) {
    this._runeAmount = val;
  }
  _runeAmount: number;

  /**
   * Asset
   */
  set asset(val: Asset) {
    if (val) {
      if (!this._asset) {
        this._asset = val;
      } else {
        if (val.symbol !== this._asset.symbol) {
          this.router.navigate(["/", "deposit", `${val.chain}.${val.symbol}`]);
          this._asset = val;
          this.assetBalance = this.userService.findBalance(
            this.balances,
            this.asset
          );
          this.assetAmount = 0;
        }
      }
    }
  }
  get asset() {
    return this._asset;
  }
  _asset: Asset;
  get assetAmount() {
    return this._assetAmount;
  }
  set assetAmount(val: number) {
    this._assetAmount = val;

    if (val) {
      this.updateRuneAmount();
    } else {
      this.runeAmount = null;
    }
  }
  private _assetAmount: number;
  assetPoolData: PoolData;

  /**
   * Balances
   */
  balances: Balances;
  runeBalance: number;
  assetBalance: number;

  user: User;
  subs: Subscription[];
  selectableMarkets: AssetAndBalance[];

  ethRouter: string;
  ethContractApprovalRequired: boolean;

  poolNotFoundErr: boolean;

  runeFee: number;
  networkFee: number;
  chainNetworkFee: number;
  depositsDisabled: boolean;
  sourceChainBalance: number;
  inboundAddresses: PoolAddressDTO[];

  haltedChains: string[];
  isHalted: boolean;

  view: DepositViews;
  // saving data of confirm in variable to pass it to the confirm
  depositData: ConfirmDepositData;
  //adding rune price for the input
  runePrice: number;

  bchLegacyPooled: boolean;

  constructor(
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute,
    private midgardService: MidgardService,
    private thorchainPricesService: ThorchainPricesService,
    public overlaysService: OverlaysService,
    private txUtilsService: TransactionUtilsService
  ) {
    this.poolNotFoundErr = false;
    this.ethContractApprovalRequired = false;
    this.rune = new Asset("THOR.RUNE");
    this.overlaysService.setCurrentDepositView("Deposit");
    this.subs = [];
    this.depositsDisabled = false;
    this.haltedChains = [];
    this.isHalted = false;
    this.bchLegacyPooled = false;
  }

  ngOnInit(): void {
    const params$ = this.route.paramMap;
    const balances$ = this.userService.userBalances$;
    const user$ = this.userService.user$.pipe(debounceTime(500));
    const inboundAddresses$ = this.midgardService.getInboundAddresses();

    const combined = combineLatest([
      params$,
      user$,
      balances$,
      inboundAddresses$,
    ]);
    const sub = combined.subscribe(
      ([params, user, balances, inboundAddresses]) => {
        // Inbound Addresses
        this.inboundAddresses = inboundAddresses;
        this.haltedChains = this.inboundAddresses
          .filter((address) => address.halted)
          .map((address) => address.chain);

        // User
        this.user = user;

        // Balance
        this.balances = balances;
        this.runeBalance = this.userService.findBalance(
          this.balances,
          this.rune
        );
        this.assetBalance = this.userService.findBalance(
          this.balances,
          this.asset
        );

        // Asset
        this.ethContractApprovalRequired = false;
        const asset = params.get("asset");

        if (asset) {
          this.asset = new Asset(asset);

          if (
            this.asset &&
            this.asset.chain === 'ETH' &&
            this.asset.ticker !== 'ETH'
          ) {
            this.checkContractApproved(this.asset);
          }

          if (asset === 'BCH.BCH') {
            this.checkLegacyBch();
          }

          this.isHalted = this.haltedChains.includes(this.asset.chain);

          this.setSourceChainBalance();

          if (isNonNativeRuneToken(this.asset)) {
            this.back();
            return;
          }

          this.getPoolDetail(asset);
          this.assetBalance = this.userService.findBalance(
            this.balances,
            this.asset
          );

          if (this.asset.chain === "ETH" && this.asset.ticker !== "ETH") {
            this.checkContractApproved(this.asset);
          }
        }
      }
    );

    const depositView$ = this.overlaysService.depositView.subscribe((view) => {
      this.view = view;
    });

    this.getPools();
    this.getEthRouter();
    this.getPoolCap();
    this.subs.push(sub, depositView$);
  }

  /**
   * This prevents user from depositing BCH with their Cash Address
   * if they have a current deposit/pending deposit with a Legacy Address
   * This prevents users from going through with a new deposit, potentially losing funds.
   */
  async checkLegacyBch() {
    if (!this.user) {
      return;
    }

    const client = this.user.clients?.bitcoinCash;
    if (!client) {
      return;
    }

    const cashAddress = client.getAddress();
    const legacyAddress = toLegacyAddress(cashAddress);
    console.log('legacy address is: ', legacyAddress);
    const bchLps = await this.midgardService
      .getThorchainLiquidityProviders('BCH.BCH')
      .toPromise();

    const match = bchLps.find((lp) => lp.asset_address === legacyAddress);
    if (match) {
      this.bchLegacyPooled = true;
    }
  }

  setSourceChainBalance() {
    if (this.asset && this.balances) {
      const sourceChainAsset = getChainAsset(this.asset.chain);
      const sourceChainBalance = this.userService.findBalance(
        this.balances,
        sourceChainAsset
      );
      this.sourceChainBalance = sourceChainBalance ?? 0;
    } else {
      this.sourceChainBalance = 0;
    }
  }

  getPoolCap() {
    const mimir$ = this.midgardService.getMimir();
    const network$ = this.midgardService.getNetwork();
    const combined = combineLatest([mimir$, network$]);
    const sub = combined.subscribe(([mimir, network]) => {
      // prettier-ignore
      const totalPooledRune = +network.totalPooledRune / (10 ** 8);

      if (mimir && mimir["mimir//MAXIMUMLIQUIDITYRUNE"]) {
        // prettier-ignore
        const maxLiquidityRune = mimir['mimir//MAXIMUMLIQUIDITYRUNE'] / (10 ** 8);
        this.depositsDisabled = totalPooledRune / maxLiquidityRune >= 0.9;
      }
    });

    this.subs.push(sub);
  }

  getEthRouter() {
    this.midgardService.getInboundAddresses().subscribe((addresses) => {
      const ethInbound = addresses.find((inbound) => inbound.chain === "ETH");
      if (ethInbound) {
        this.ethRouter = ethInbound.router;
      }
    });
  }

  contractApproved() {
    this.ethContractApprovalRequired = false;
  }

  async checkContractApproved(asset: Asset) {
    if (this.ethRouter && this.user) {
      const assetAddress = asset.symbol.slice(asset.ticker.length + 1);
      const strip0x = assetAddress.substr(2);
      const isApproved = await this.user.clients.ethereum.isApproved(
        this.ethRouter,
        strip0x,
        baseAmount(1)
      );
      this.ethContractApprovalRequired = !isApproved;
    }
  }

  updateRuneAmount() {
    const runeAmount = getValueOfAssetInRune(
      assetToBase(assetAmount(this.assetAmount)),
      this.assetPoolData
    );
    this.runeAmount = runeAmount.amount().isLessThan(0)
      ? 0
      : runeAmount
          .amount()
          .div(10 ** 8)
          .toNumber();
  }

  async getPoolDetail(asset: string) {
    if (!this.inboundAddresses) {
      console.error("error fetching inbound addresses");
      return;
    }

    this.midgardService.getPool(asset).subscribe(
      (res) => {
        if (res) {
          this.assetPoolData = {
            assetBalance: baseAmount(res.assetDepth),
            runeBalance: baseAmount(res.runeDepth),
          };

          this.networkFee = this.txUtilsService.calculateNetworkFee(
            this.asset,
            this.inboundAddresses,
            "INBOUND",
            res
          );

          this.chainNetworkFee = this.txUtilsService.calculateNetworkFee(
            getChainAsset(this.asset.chain),
            this.inboundAddresses,
            "INBOUND",
            res
          );

          this.runeFee = this.txUtilsService.calculateNetworkFee(
            new Asset("THOR.RUNE"),
            this.inboundAddresses,
            "INBOUND",
            res
          );
        }
      },
      (err) => {
        console.error("error getting pool detail: ", err);
        this.poolNotFoundErr = true;
      }
    );
  }

  getPools() {
    this.midgardService.getPools().subscribe(
      (res) => {
        this.selectableMarkets = res
          .sort((a, b) => a.asset.localeCompare(b.asset))
          .map((pool) => ({
            asset: new Asset(pool.asset),
            assetPriceUSD: +pool.assetPriceUSD,
          }))
          // filter out until we can add support
          .filter(
            (pool) =>
              pool.asset.chain === 'BNB' ||
              pool.asset.chain === 'BTC' ||
              pool.asset.chain === 'ETH' ||
              pool.asset.chain === 'LTC' ||
              pool.asset.chain === 'BCH'
          )

          // filter out non-native RUNE tokens
          .filter((pool) => !isNonNativeRuneToken(pool.asset))

          // filter out halted chains
          .filter((pool) => !this.haltedChains.includes(pool.asset.chain));

        //add rune price
        const availablePools = res.filter(
          (pool) => pool.status === "available"
        );
        this.runePrice =
          this.thorchainPricesService.estimateRunePrice(availablePools);
      },
      (err) => console.error("error fetching pools:", err)
    );
  }

  formDisabled(): boolean {
    return (
      !this.balances ||
      !this.runeAmount ||
      !this.assetAmount ||
      this.ethContractApprovalRequired ||
      this.depositsDisabled ||
      this.isHalted ||
      this.assetAmount <= this.userService.minimumSpendable(this.asset) ||
      // check sufficient underlying chain balance to cover fees
      this.sourceChainBalance <= this.chainNetworkFee ||
      // outbound fee plus inbound fee
      this.assetAmount <= this.networkFee * 3 + this.networkFee ||
      /**
       * Asset matches chain asset
       * check balance + amount < chain_network_fee
       */
      (assetToString(getChainAsset(this.asset.chain)) ===
        assetToString(this.asset) &&
        this.assetAmount >=
          this.userService.maximumSpendableBalance(
            this.asset,
            this.sourceChainBalance,
            this.inboundAddresses
          )) ||
      this.assetBalance < this.assetAmount ||
      this.runeBalance - this.runeAmount < 3
    );
  }

  mainButtonText(): string {
    /** Wallet not connected */
    if (!this.balances) {
      return "Please connect wallet";
    }

    if (this.balances && (!this.runeAmount || !this.assetAmount)) {
      return "Prepare";
    }

    if (this.depositsDisabled) {
      return "CAPS REACHED";
    }

    if (this.bchLegacyPooled) {
      return "Pooled BCH with a legacy address"
    }

    if (!this.asset) {
      return "There is no asset here!";
    }

    if (this.isHalted) {
      return "Pool Halted";
    }

    /** User either lacks asset balance or RUNE balance */
    if (this.balances && (!this.runeAmount || !this.assetAmount)) {
      return "Enter an amount";
    }

    /** Asset amount is greater than balance */
    if (this.assetBalance < this.assetAmount) {
      return `Insufficient ${this.asset.ticker}`;
    }

    /** RUNE amount exceeds RUNE balance. Leave 3 RUNE in balance */
    if (this.runeBalance - this.runeAmount < 3) {
      return "Min 3 RUNE in Wallet";
    }

    /** Checks sufficient chain balance for fee */
    if (this.sourceChainBalance <= this.chainNetworkFee) {
      return `Insufficient ${this.asset.chain}`;
    }

    /**
     * Asset matches chain asset
     * check balance + amount < chain_network_fee
     */
    if (
      assetToString(getChainAsset(this.asset.chain)) ===
        assetToString(this.asset) &&
      this.assetAmount >=
        this.userService.maximumSpendableBalance(
          this.asset,
          this.sourceChainBalance,
          this.inboundAddresses
        )
    ) {
      return `Insufficient ${this.asset.chain}`;
    }

    /** Amount is too low, considered "dusting" */
    if (this.assetAmount <= this.userService.minimumSpendable(this.asset)) {
      return "Amount too low";
    }

    /**
     * Deposit amount should be more than outbound fee + inbound fee network fee costs
     * Ensures sufficient amount to withdraw
     */
    if (this.assetAmount <= this.networkFee * 3 + this.networkFee) {
      return "Amount too low";
    }

    /** Good to go */
    if (
      this.runeAmount &&
      this.assetAmount &&
      this.runeAmount <= this.runeBalance &&
      this.assetAmount <= this.assetBalance
    ) {
      return "Ready";
    } else {
      console.warn("mismatch case for main button text");
      return;
    }
  }

  openConfirmationDialog() {
    const runeBasePrice = getValueOfAssetInRune(
      assetToBase(assetAmount(1)),
      this.assetPoolData
    )
      .amount()
      .div(10 ** 8)
      .toNumber();
    const assetBasePrice = getValueOfRuneInAsset(
      assetToBase(assetAmount(1)),
      this.assetPoolData
    )
      .amount()
      .div(10 ** 8)
      .toNumber();
    const assetPrice = this.selectableMarkets.find(
      (asset) => this.asset.symbol === asset.asset.symbol
    ).assetPriceUSD;
    const assetData: AssetAndBalance = {
      asset: this.asset,
      balance: assetAmount(this.assetBalance, 8),
      assetPriceUSD: assetPrice,
    };
    const runeData: AssetAndBalance = {
      asset: this.rune,
      balance: assetAmount(this.runeBalance, 8),
      assetPriceUSD: this.runePrice,
    };

    this.depositData = {
      asset: assetData,
      rune: runeData,
      assetAmount: this.assetAmount,
      runeAmount: this.runeAmount,
      user: this.user,
      runeBasePrice,
      assetBasePrice,
      assetBalance: this.assetBalance,
      runeBalance: this.runeBalance,
      runePrice: this.runePrice,
      runeFee: this.runeFee,
      estimatedFee: this.networkFee,
      assetPrice,
    };

    if (this.depositData) this.overlaysService.setCurrentDepositView("Confirm");
  }

  closeSuccess(transactionSuccess: boolean): void {
    if (transactionSuccess) {
      this.assetAmount = 0;
    }

    this.overlaysService.setCurrentDepositView("Deposit");
  }

  back(): void {
    this.router.navigate(["/", "pool"]);
  }

  goToNav(nav: string) {
    if (nav === "pool") {
      this.router.navigate(["/", "pool"]);
    } else if (nav === "swap") {
      this.router.navigate(["/", "swap"]);
    } else if (nav === "deposit") {
      this.router.navigate([
        "/",
        "deposit",
        `${this.asset.chain}.${this.asset.symbol}`,
      ]);
    } else if (nav === "deposit-back") {
      this.overlaysService.setCurrentDepositView("Deposit");
    }
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
