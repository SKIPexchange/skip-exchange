import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-text-field',
  templateUrl: './text-field.component.html',
  styleUrls: ['./text-field.component.scss'],
})
export class TextFieldComponent implements OnInit {
  @Input() textOfField: string;
  @Output() textOfFieldChange = new EventEmitter<string>();

  @Input() selectedType: 'Password' | 'Text' | 'Number' = 'Text';
  @Input() mode: 'Single' | 'Double' = 'Single';

  @Input() label: string = 'TEXT';
  @Input() name: string;

  @Input() textOfFieldTwo: string;
  @Output() textOfFieldTwoChange = new EventEmitter<string>();

  @Input() typeTwo: 'Password' | 'Text' | 'Number' = 'Text';
  @Input() modeTwo: 'Single' | 'Double' = 'Single';

  @Input() labelTwo: string = 'TEXT';
  @Input() nameTwo: string;

  @Input() disable: boolean = false;
  @Input() disableTwo: boolean = false;

  @Input() placeHolder: string[] = [' ', ' '];
  @Input() processing: boolean;

  constructor() {}

  // eslint-disable-next-line @angular-eslint/no-empty-lifecycle-method
  ngOnInit(): void {}

  updateFieldText(val) {
    this.textOfFieldChange.emit(val);
  }

  updateFieldTextTwo(val) {
    this.textOfFieldTwoChange.emit(val);
  }
}
