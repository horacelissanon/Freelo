'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { ClientForm } from '@/components/forms/ClientForm';
import { ProjectForm } from '@/components/forms/ProjectForm';
import { InvoiceForm } from '@/components/forms/InvoiceForm';

export type CreateEntity = 'client' | 'project' | 'quote' | 'invoice';

// 'quote' is excluded — it navigates to a dedicated page (the multi-pack
// builder doesn't fit the Modal's max-w-3xl/max-h-[90vh] constraints) rather
// than opening in-place like the other three.
type ModalEntity = Exclude<CreateEntity, 'quote'>;

interface CreateMenuContextValue {
  openCreate: (entity: CreateEntity) => void;
}

const CreateMenuContext = createContext<CreateMenuContextValue | null>(null);

export function useCreateMenu(): CreateMenuContextValue {
  const ctx = useContext(CreateMenuContext);
  if (!ctx) throw new Error('useCreateMenu must be used inside CreateMenuProvider');
  return ctx;
}

const TITLES: Record<ModalEntity, string> = {
  client: 'Nouveau client',
  project: 'Nouveau projet',
  invoice: 'Nouvelle facture',
};

export function CreateMenuProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [active, setActive] = useState<ModalEntity | null>(null);

  function close() {
    setActive(null);
  }

  function openCreate(entity: CreateEntity) {
    if (entity === 'quote') {
      router.push('/invoices/new-quote');
      return;
    }
    setActive(entity);
  }

  return (
    <CreateMenuContext.Provider value={{ openCreate }}>
      {children}
      {active && (
        <Modal
          title={TITLES[active]}
          onClose={close}
          size={active === 'client' || active === 'invoice' ? 'lg' : 'md'}
        >
          {active === 'client' && <ClientForm onDone={close} />}
          {active === 'project' && (
            <ProjectForm onDone={close} onNeedClient={() => setActive('client')} />
          )}
          {active === 'invoice' && (
            <InvoiceForm onDone={close} onNeedClient={() => setActive('client')} />
          )}
        </Modal>
      )}
    </CreateMenuContext.Provider>
  );
}
