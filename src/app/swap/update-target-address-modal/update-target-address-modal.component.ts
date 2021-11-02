import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { Chain } from '@xchainjs/xchain-util';
import { User } from 'src/app/_classes/user';
import { AnalyticsService } from 'src/app/_services/analytics.service';
import {
  MainViewsEnum,
  OverlaysService,
} from 'src/app/_services/overlays.service';
import { MockClientService } from 'src/app/_services/mock-client.service';
import { UserService } from 'src/app/_services/user.service';
import { TranslateService } from 'src/app/_services/translate.service';

@Component({
  selector: 'app-update-target-address-modal',
  templateUrl: './update-target-address-modal.component.html',
  styleUrls: ['./update-target-address-modal.component.scss'],
})
export class UpdateTargetAddressModalComponent implements OnInit {
  @Output() back: EventEmitter<string> = new EventEmitter<string>();
  @Input() data: any;
  targetAddress: string;
  user: User;
  chain: Chain;
  thorAddress: string = undefined;

  constructor(
    private userService: UserService,
    private oveService: OverlaysService,
    private analytics: AnalyticsService,
    private mockClientService: MockClientService,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.user = this.data?.user ?? null;
    this.chain = this.data?.chain ?? null;
    this.targetAddress = this.data?.targetAddress ?? '';

    //For events
    this.thorAddress =
      this.userService.getTokenAddress(this.user, Chain.THORChain) ?? undefined;
  }

  breadcurmbNav(val: string) {
    if (val === 'skip') {
      this.analytics.event(
        'swap_receive_container_target_address_select',
        'breadcrumb_skip'
      );
      this.oveService.setViews(MainViewsEnum.Swap, 'Swap');
    } else if (val === 'swap') {
      this.analytics.event(
        'swap_receive_container_target_address_select',
        'breadcrumb_swap'
      );
      this.oveService.setViews(MainViewsEnum.Swap, 'Swap');
    }
  }

  updateAddress() {
    if (
      !this.mockClientService
        .getMockClientByChain(this.chain)
        .validateAddress(this.targetAddress)
    ) {
      return;
    }

    if (this.targetAddress !== this.data.targetAddress)
      this.analytics.event(
        'swap_receive_container_target_address_select',
        'button_target_address_save_changed'
      );
    else
      this.analytics.event(
        'swap_receive_container_target_address_select',
        'button_target_address_save'
      );

    this.close();
  }

  formDisabled(): boolean {
    if (!this.user) {
      return true;
    }

    if (
      !this.mockClientService
        .getMockClientByChain(this.chain)
        .validateAddress(this.targetAddress)
    ) {
      return true;
    }

    return false;
  }

  updateAddressBtnText() {
    if (!this.user?.clients) {
      return {
        text: this.translate.format('breadcrumb.noUserFound'),
        isError: true,
      };
    }

    const client =
      this.userService.getChainClient(this.user, this.chain) ??
      this.mockClientService.getMockClientByChain(this.chain);
    if (!client) {
      return {
        text: this.translate.format('breadcrumb.noClient', {
          chain: this.chain,
        }),
        isError: false,
      };
    }

    if (
      !client.validateAddress(this.targetAddress) &&
      this.targetAddress.length > 5
    ) {
      return {
        text: this.translate.format('breadcrumb.invalidAddress', {
          chain: this.chain,
        }),
        isError: true,
      };
    }

    if (!this.user) {
      return this.translate.format('breadcrumb.noUserFound');
    }

    return {
      text: this.translate.format('breadcrumb.prepare'),
      isError: false,
    };
  }

  close() {
    /** because this is only a component in swap page so the analytics are static */
    this.back.emit(this.targetAddress);
    this.oveService.setCurrentSwapView('Swap');
  }

  backEmit() {
    this.analytics.event(
      'swap_receive_container_target_address_select',
      'button_target_address_cancel'
    );
    this.oveService.setCurrentSwapView('Swap');
  }
}
