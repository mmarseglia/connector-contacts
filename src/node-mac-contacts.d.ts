declare module "node-mac-contacts" {
  interface Contact {
    identifier: string;
    firstName: string;
    lastName: string;
    nickname: string;
    birthday: string;
    phoneNumbers: string[];
    emailAddresses: string[];
    postalAddresses: string[];
    jobTitle?: string;
    departmentName?: string;
    organizationName?: string;
    middleName?: string;
    note?: string;
    urlAddresses?: string[];
    socialProfiles?: Array<{ label: string; value: string }>;
    instantMessageAddresses?: Array<{ label: string; value: string }>;
    contactImage?: Buffer;
    contactThumbnailImage?: Buffer;
  }

  interface ContactInput {
    firstName: string;
    lastName?: string;
    nickname?: string;
    middleName?: string;
    jobTitle?: string;
    departmentName?: string;
    organizationName?: string;
    birthday?: string;
    phoneNumbers?: string[];
    emailAddresses?: string[];
    urlAddresses?: string[];
    identifier?: string;
  }

  interface DeleteInput {
    identifier?: string;
    name?: string;
  }

  function getAuthStatus(): string;
  function requestAccess(): Promise<string>;
  function getAllContacts(extraProperties?: string[]): Contact[];
  function getContactsByName(name: string, extraProperties?: string[]): Contact[];
  function addNewContact(contact: ContactInput): boolean;
  function updateContact(contact: ContactInput): boolean;
  function deleteContact(input: DeleteInput): boolean;

  const listener: {
    setup(): void;
    remove(): void;
    isListening(): boolean;
  };

  export default {
    getAuthStatus,
    requestAccess,
    getAllContacts,
    getContactsByName,
    addNewContact,
    updateContact,
    deleteContact,
    listener,
  };
}
