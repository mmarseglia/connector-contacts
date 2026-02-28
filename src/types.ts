/**
 * Contact shape returned by node-mac-contacts for basic queries.
 */
export interface ContactBasic {
  identifier: string;
  firstName: string;
  lastName: string;
  nickname: string;
  birthday: string;
  phoneNumbers: string[];
  emailAddresses: string[];
  postalAddresses: string[];
}

/**
 * Extended contact with all extra properties fetched via node-mac-contacts.
 */
export interface ContactFull extends ContactBasic {
  jobTitle: string;
  departmentName: string;
  organizationName: string;
  middleName: string;
  note: string;
  urlAddresses: string[];
  socialProfiles: Array<{ label: string; value: string }>;
  instantMessageAddresses: Array<{ label: string; value: string }>;
}

/**
 * Input shape for creating or updating a contact via node-mac-contacts.
 */
export interface ContactInput {
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
}
