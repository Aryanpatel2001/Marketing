import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Contact } from './entities/contact.entity';
import { ContactList } from './entities/contact-list.entity';
import { ContactListMember } from './entities/contact-list-member.entity';
import { ContactActivity } from './entities/contact-activity.entity';
import { ImportJob } from './entities/import-job.entity';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { ImportController } from './import.controller';
import { ImportProcessorService } from './services/import-processor.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, ContactList, ContactListMember, ContactActivity, ImportJob]),
    MulterModule.register({
      dest: './uploads/imports',
    }),
    TenantsModule,
  ],
  controllers: [ContactsController, ImportController],
  providers: [ContactsService, ImportProcessorService],
  exports: [ContactsService, ImportProcessorService],
})
export class ContactsModule {}
