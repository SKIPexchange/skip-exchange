import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-tag',
  templateUrl: './tag.component.html',
  styleUrls: ['./tag.component.scss'],
})
export class TagComponent implements OnInit {
  @Input() type: 'dark' | 'green' | 'outline' | 'outline-green' = 'outline';
  @Input() color: string;
  @Input() active: boolean;

  constructor() {}

  ngOnInit(): void {}

  getMode() {
    return this.type;
  }
}
