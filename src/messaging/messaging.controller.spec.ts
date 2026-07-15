import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

describe('MessagingController', () => {
  const messaging = {
    createContact: jest.fn(),
    listContacts: jest.fn(),
    updateContact: jest.fn(),
    createTemplate: jest.fn(),
    listTemplates: jest.fn(),
    updateTemplate: jest.fn(),
    createCiclo: jest.fn(),
    listCiclos: jest.fn(),
    updateCiclo: jest.fn(),
    upsertWorkStatus: jest.fn(),
    listWorkStatuses: jest.fn(),
    listDispatches: jest.fn(),
    runWeeklyStatusDispatch: jest.fn(),
  } as unknown as MessagingService;

  const controller = new MessagingController(messaging);

  it('delegates contact and template routes', async () => {
    await controller.createContact({ phone: '5491112345678' });
    await controller.listContacts();
    await controller.updateContact('id', { active: false });
    await controller.createTemplate({
      key: 'weekly',
      name: 'Weekly',
      body: { text: 'x', widgets: [] },
    });
    await controller.listTemplates();
    await controller.updateTemplate('weekly', { active: true });

    expect(messaging.createContact).toHaveBeenCalled();
    expect(messaging.updateTemplate).toHaveBeenCalledWith('weekly', {
      active: true,
    });
  });

  it('delegates ciclo, work-status, and dispatch routes', async () => {
    await controller.createCiclo({
      name: 'C1',
      ciclo_inicio: '2026-07-01',
      ciclo_fin: '2026-08-01',
      templateKey: 'weekly',
    });
    await controller.listCiclos();
    await controller.updateCiclo('id', { active: true });
    await controller.upsertWorkStatus({
      cicloId: 'id',
      weekNumber: 1,
      percent: 20,
    });
    await controller.listWorkStatuses('id');
    await controller.listDispatches('id');
    await controller.runWeeklyDispatch();

    expect(messaging.runWeeklyStatusDispatch).toHaveBeenCalled();
    expect(messaging.upsertWorkStatus).toHaveBeenCalled();
  });
});
