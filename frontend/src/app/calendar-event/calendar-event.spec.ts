import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalendarEventComponent } from './calendar-event';

describe('CalendarEvent', () => {
  let component: CalendarEventComponent;
  let fixture: ComponentFixture<CalendarEventComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarEventComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarEventComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
