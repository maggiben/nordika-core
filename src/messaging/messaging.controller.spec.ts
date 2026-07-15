import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

describe('MessagingController', () => {
  const createContact = jest.fn();
  const listContacts = jest.fn();
  const updateContact = jest.fn();
  const createTemplate = jest.fn();
  const listTemplates = jest.fn();
  const updateTemplate = jest.fn();
  const createCiclo = jest.fn();
  const listCiclos = jest.fn();
  const updateCiclo = jest.fn();
  const upsertWorkStatus = jest.fn();
  const listWorkStatuses = jest.fn();
  const listDispatches = jest.fn();
  const listStaffRoster = jest.fn();
  const createCatalogMessage = jest.fn();
  const listCatalogMessages = jest.fn();
  const updateCatalogMessage = jest.fn();
  const assignCatalogMessage = jest.fn();
  const sendCatalogMessage = jest.fn();
  const deleteCatalogMessage = jest.fn();
  const sendTestMessage = jest.fn();
  const remindContact = jest.fn();
  const runWeeklyStatusDispatch = jest.fn();

  const messaging = {
    createContact,
    listContacts,
    updateContact,
    createTemplate,
    listTemplates,
    updateTemplate,
    createCiclo,
    listCiclos,
    updateCiclo,
    upsertWorkStatus,
    listWorkStatuses,
    listDispatches,
    listStaffRoster,
    createCatalogMessage,
    listCatalogMessages,
    updateCatalogMessage,
    assignCatalogMessage,
    sendCatalogMessage,
    deleteCatalogMessage,
    sendTestMessage,
    remindContact,
    runWeeklyStatusDispatch,
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

    expect(createContact).toHaveBeenCalled();
    expect(updateTemplate).toHaveBeenCalledWith('weekly', {
      active: true,
    });
  });

  it('delegates ciclo, work-status, roster, and dispatch routes', async () => {
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
    await controller.listStaffRoster();
    await controller.createCatalogMessage({
      title: 'Hola',
      body: 'Mensaje',
    });
    await controller.listCatalogMessages();
    await controller.updateCatalogMessage('id', { title: 'Nuevo' });
    await controller.assignCatalogMessage('id', { contactId: 'c1' });
    await controller.sendCatalogMessage('id', { contactId: 'c1' });
    await controller.deleteCatalogMessage('id');
    await controller.testSend({
      phone: '5491112345678',
      templateKey: 'weekly_status',
    });
    await controller.remind({ contactId: 'id' });
    await controller.runWeeklyDispatch();

    expect(runWeeklyStatusDispatch).toHaveBeenCalled();
    expect(upsertWorkStatus).toHaveBeenCalled();
    expect(listStaffRoster).toHaveBeenCalled();
    expect(createCatalogMessage).toHaveBeenCalled();
    expect(sendCatalogMessage).toHaveBeenCalledWith('id', { contactId: 'c1' });
    expect(deleteCatalogMessage).toHaveBeenCalledWith('id');
    expect(sendTestMessage).toHaveBeenCalled();
    expect(remindContact).toHaveBeenCalledWith('id');
  });
});
