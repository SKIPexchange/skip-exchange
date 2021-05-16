import { Component, OnInit, Output, EventEmitter } from "@angular/core";
import { UserService } from "src/app/_services/user.service";
import { XDEFIService } from "src/app/_services/xdefi.service";
import { environment } from "src/environments/environment";

@Component({
  selector: "app-xdefi-connect",
  templateUrl: "./xdefi-connect.component.html",
  styleUrls: ["./xdefi-connect.component.scss"],
})
export class XDEFIConnectComponent implements OnInit {
  xdefi;
  xdefiConnecting: boolean;
  xdefiError: boolean;
  listProviders: typeof XDEFIService.listProvider;
  isValidNetwork: boolean;
  @Output() back: EventEmitter<null>;
  @Output() closeModal: EventEmitter<null>;
  isTestnet: boolean;

  message: string;

  constructor(
    private userService: UserService,
    private xdefiService: XDEFIService
  ) {
    this.back = new EventEmitter<null>();
    this.closeModal = new EventEmitter<null>();
    this.isTestnet = environment.network === "testnet";
  }

  ngOnInit(): void {
    this.listProviders = this.xdefiService.listEnabledXDFIProviders();
    this.isValidNetwork = this.xdefiService.isValidNetwork();
  }

  getBreadcrumbText() {
    if (this.xdefiError) {
      return { text: "An xdefi error occureded", isError: true };
    }

    if (!this.isValidNetwork) {
      return { text: "Incorrect network!", isError: true };
    }

    if (this.xdefiConnecting) {
      return { text: "Connecting", isError: false };
    }

    return { text: "Are these enabled in xdefi?", isError: false };
  }

  clearKeystore() {
    this.back.emit();
  }

  async initUnlock() {
    if (this.xdefiConnecting) {
      return;
    }
    setTimeout(() => {
      this.xdefiConnect();
    }, 100);
  }

  async xdefiConnect() {
    this.xdefiError = false;
    this.xdefiConnecting = true;
    try {
      const user = await this.xdefiService.connectXDEFI();
      console.log("xdefiConnect::got user", user);
      this.userService.setUser(user);
      localStorage.setItem("XDEFI_CONNECTED", "true");
      this.closeModal.emit();
    } catch (error) {
      this.xdefiError = true;
      console.error(error);
    }
  }

  backClicked() {
    this.back.emit();
  }
}
