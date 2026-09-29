import {
  demoClients,
  filterClients,
  type DemoClient,
} from '../src/features/trainer-clients/demo';
import { trainerClients } from '../src/features/trainer-clients/ru';

const name = (person: DemoClient) => trainerClients.people[person.id].name;

describe('trainer client directory', () => {
  it('sorts the demo directory by Russian client names', () => {
    expect(
      filterClients(demoClients, '', 'all', name).map((person) => person.id),
    ).toEqual(['c1', 'c3', 'c2', 'c5', 'c4', 'c6']);
  });

  it('combines normalized name and phone searches with the current filter', () => {
    expect(
      filterClients(demoClients, '  АЙГЕРИМ ', 'due', name).map(
        (person) => person.id,
      ),
    ).toEqual(['c1']);
    expect(
      filterClients(demoClients, '+7 (702) 550', 'all', name).map(
        (person) => person.id,
      ),
    ).toEqual(['c2']);
    expect(filterClients(demoClients, 'Арман', 'due', name)).toEqual([]);
    expect(filterClients(demoClients, 'неизвестный', 'all', name)).toEqual([]);
  });

  it('keeps cancelled group participation out of the upcoming list', () => {
    expect(
      filterClients(demoClients, '', 'unscheduled', name).map(
        (person) => person.id,
      ),
    ).toEqual(['c4', 'c6']);
    expect(
      filterClients(demoClients, '', 'due', name).map((person) => person.id),
    ).toEqual(['c1', 'c4']);
    expect(filterClients([], '', 'all', name)).toEqual([]);
  });
});
