import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Contact } from './contact.entity';
import { ContactList } from './contact-list.entity';

@Entity('contact_list_members')
@Index(['contactListId', 'contactId'], { unique: true })
export class ContactListMember {
  @PrimaryColumn({ name: 'contact_list_id', type: 'uuid' })
  contactListId: string;

  @PrimaryColumn({ name: 'contact_id', type: 'uuid' })
  contactId: string;

  @CreateDateColumn({ name: 'added_at', type: 'timestamp with time zone' })
  addedAt: Date;

  @Column({ name: 'added_by_id', type: 'uuid', nullable: true })
  addedById: string | null;

  // Relations
  @ManyToOne(() => ContactList, (list) => list.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_list_id' })
  contactList: ContactList;

  @ManyToOne(() => Contact, (contact) => contact.listMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;
}
