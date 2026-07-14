export interface Reservation {
  namespace: string;
  key: string;
}

export class LogicalReservationStore {
  private readonly reservations = new Map<string, Reservation>();

  reserve(namespace: string, key: string): boolean {
    const composite = `${namespace.length}:${namespace}${key}`;
    if (this.reservations.has(composite)) return false;
    this.reservations.set(composite, { namespace, key });
    return true;
  }

  snapshot(): Reservation[] {
    return [...this.reservations.values()]
      .sort((left, right) =>
        `${left.namespace}\0${left.key}`.localeCompare(`${right.namespace}\0${right.key}`),
      )
      .map((item) => ({ ...item }));
  }
}
