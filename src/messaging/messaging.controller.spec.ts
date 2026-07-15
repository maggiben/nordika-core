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
  const reorderCatalogMessages = jest.fn();
  const listFlows = jest.fn();
  const createFlow = jest.fn();
  const listFlowRuns = jest.fn();
  const getFlowRun = jest.fn();
  const getFlow = jest.fn();
  const updateFlow = jest.fn();
  const deleteFlow = jest.fn();
  const startFlow = jest.fn();
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
    reorderCatalogMessages,
    listFlows,
    createFlow,
    listFlowRuns,
    getFlowRun,
    getFlow,
    updateFlow,
    deleteFlow,
    startFlow,
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
    await controller.reorderCatalogMessages({
      contactId: 'c1',
      orderedIds: ['id'],
    });
    await controller.deleteCatalogMessage('id');
    await controller.listFlows();
    await controller.createFlow({
      name: 'Flow',
      startNodeId: 'a',
      nodes: [
        {
          id: 'a',
          title: 'A',
          body: 'A',
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    await controller.listFlowRuns('c1');
    await controller.getFlowRun('run1');
    await controller.getFlow('flow1');
    await controller.updateFlow('flow1', {
      name: 'Flow 2',
      startNodeId: 'a',
      nodes: [
        {
          id: 'a',
          title: 'A',
          body: 'A',
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    await controller.deleteFlow('flow1');
    await controller.startFlow('flow1', { contactId: 'c1' });
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
    expect(reorderCatalogMessages).toHaveBeenCalledWith({
      contactId: 'c1',
      orderedIds: ['id'],
    });
    expect(deleteCatalogMessage).toHaveBeenCalledWith('id');
    expect(listFlows).toHaveBeenCalled();
    expect(startFlow).toHaveBeenCalledWith('flow1', { contactId: 'c1' });
    expect(sendTestMessage).toHaveBeenCalled();
    expect(remindContact).toHaveBeenCalledWith('id');
  });
});
