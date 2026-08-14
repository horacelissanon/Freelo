'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ClientForm } from '@/components/forms/ClientForm';
import { ProjectForm } from '@/components/forms/ProjectForm';
import { InvoiceForm } from '@/components/forms/InvoiceForm';

export type CreateEntity = 'client' | 'project' | 'quote' | 'invoice';

interface CreateMenuContextValue {
  openCreate: (entity: CreateEntity) => void;
}

const CreateMenuContext = createContext<CreateMenuContextValue | null>(null);

export function useCreateMenu(): CreateMenuContextValue {
  const ctx = useContext(CreateMenuContext);
  if (!ctx) throw new Error('useCreateMenu must be used inside CreateMenuProvider');
  return ctx;
}

const TITLES: Record<CreateEntity, string> = {
  client: 'Nouveau client',
  project: 'Nouveau projet',
  quote: 'Nouveau devis',
  invoice: 'Nouvelle facture',
};

export function CreateMenuProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<CreateEntity | null>(null);

  function close() {
    setActive(null);
  }

  return (
    <CreateMenuContext.Provider value={{ openCreate: setActive }}>
      {children}
      {active && (
        <Modal
          title={TITLES[active]}
          onClose={close}
          size={active === 'client' || active === 'quote' || active === 'invoice' ? 'lg' : 'md'}
        >
          {active === 'client' && <ClientForm onDone={close} />}
          {active === 'project' && (
            <ProjectForm onDone={close} onNeedClient={() => setActive('client')} />
          )}
          {(active === 'quote' || active === 'invoice') && (
            <InvoiceForm
              initialDocType={active === 'quote' ? 'QUOTE' : 'INVOICE'}
              onDone={close}
              onNeedClient={() => setActive('client')}
            />
          )}
        </Modal>
      )}
    </CreateMenuContext.Provider>
  );
}
