import { DocumentItem, ReceiverAccount } from '../types';

export const INITIAL_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc-1',
    title: "Carta d'Identità Elettronica",
    category: 'identity',
    ownerName: 'Mario Rossi',
    documentNumber: 'CA12345ZZ',
    issueDate: '2022-05-10',
    expiryDate: '2032-05-10',
    issuingAuthority: 'Comune di Milano',
    essentialFields: {
      'Cognome': 'Rossi',
      'Nome': 'Mario',
      'Data di Nascita': '15/10/1988',
      'Luogo di Nascita': 'Milano (MI)',
      'Codice Fiscale': 'RSSMRA88R15F205Z',
      'Numero Documento': 'CA12345ZZ',
      'Indirizzo di Residenza': 'Via Roma 45, 20121 Milano (MI)',
      'Nazionalità': 'Italiana',
      'Scadenza Documento': '10/05/2032'
    },
    fileName: 'carta_identita_mario_rossi.pdf',
    fileType: 'application/pdf',
    fileSize: '1.2 MB',
    createdAt: new Date().toISOString(),
    defaultShareMode: 'essential_text',
    notes: 'Documento principale per check-in hotel, pratiche burocratiche e verbali.'
  },
  {
    id: 'doc-2',
    title: 'Patente di Guida (Cat. B)',
    category: 'license',
    ownerName: 'Mario Rossi',
    documentNumber: 'U19876543X',
    issueDate: '2020-09-14',
    expiryDate: '2030-09-14',
    issuingAuthority: 'MIT - UCO',
    essentialFields: {
      'Cognome': 'Rossi',
      'Nome': 'Mario',
      'Data di Nascita': '15/10/1988',
      'Numero Patente': 'U19876543X',
      'Categoria': 'B',
      'Scadenza Validità': '14/09/2030',
      'Ente Rilascio': 'Ufficio Centrale Operativo (UCO)'
    },
    fileName: 'patente_guida_mario.jpg',
    fileType: 'image/jpeg',
    fileSize: '840 KB',
    createdAt: new Date().toISOString(),
    defaultShareMode: 'essential_text',
    notes: 'Per autonoleggi, prenotazione veicoli e identificazione al volante.'
  },
  {
    id: 'doc-3',
    title: 'Passaporto Italiano',
    category: 'passport',
    ownerName: 'Mario Rossi',
    documentNumber: 'YA9876543',
    issueDate: '2021-03-20',
    expiryDate: '2031-03-20',
    issuingAuthority: 'Questura di Milano',
    essentialFields: {
      'Cognome': 'Rossi',
      'Nome': 'Mario',
      'Tipo': 'P',
      'Codice Paese': 'ITA',
      'Numero Passaporto': 'YA9876543',
      'Sesso': 'M',
      'Data di Scadenza': '20/03/2031'
    },
    fileName: 'passaporto_rossi_mario.pdf',
    fileType: 'application/pdf',
    fileSize: '2.4 MB',
    createdAt: new Date().toISOString(),
    defaultShareMode: 'essential_text',
    notes: 'Documento internazionale di viaggio.'
  },
  {
    id: 'doc-4',
    title: 'Tessera Sanitaria / Codice Fiscale',
    category: 'health',
    ownerName: 'Mario Rossi',
    documentNumber: '80380001234567890123',
    issueDate: '2021-01-01',
    expiryDate: '2027-01-01',
    issuingAuthority: 'Ministero dell\'Economia e delle Finanze',
    essentialFields: {
      'Codice Fiscale': 'RSSMRA88R15F205Z',
      'Cognome': 'Rossi',
      'Nome': 'Mario',
      'Data Scadenza Tessera': '01/01/2027',
      'Numero Identificativo': '80380001234567890123'
    },
    fileName: 'tessera_sanitaria.pdf',
    fileType: 'application/pdf',
    fileSize: '450 KB',
    createdAt: new Date().toISOString(),
    defaultShareMode: 'essential_text',
    notes: 'Per farmacie, cliniche private e pratiche sanitarie.'
  }
];

export const REGISTERED_RECEIVERS: ReceiverAccount[] = [
  {
    id: 'rec-1',
    name: 'Hotel Continental Reception',
    category: 'Struttura Alberghiera',
    location: 'Milano Centro - Via Manzoni 12',
    trustLevel: 'verified'
  },
  {
    id: 'rec-2',
    name: 'Autonoleggio Prime Nolo',
    category: 'Noleggio Veicoli',
    location: 'Aeroporto Malpensa - Terminal 1',
    trustLevel: 'verified'
  },
  {
    id: 'rec-3',
    name: 'Comune di Milano - Uff. Anagrafe',
    category: 'Pubblica Amministrazione',
    location: 'Via Larga 12, Milano',
    trustLevel: 'partner'
  },
  {
    id: 'rec-4',
    name: 'Studio Medico San Carlo',
    category: 'Sanità Privata',
    location: 'Corso Buenos Aires 88, Milano',
    trustLevel: 'verified'
  }
];
