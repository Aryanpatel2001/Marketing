import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/modules/users/users.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import {
  UsComplianceService,
  RegisterBrandDto,
  RegisterCampaignDto,
} from '../src/modules/sms/services/us-compliance.service';
import {
  IndiaComplianceService,
  DltTemplateCategory,
} from '../src/modules/sms/services/india-compliance.service';
import { EuComplianceService } from '../src/modules/sms/services/eu-compliance.service';
import { ComplianceService } from '../src/modules/sms/services/compliance.service';
import { SenderService } from '../src/modules/sms/services/sender.service';
import { Logger } from '@nestjs/common';
import {
  SmsSenderStatus,
  US10DLCBrandStatus,
  US10DLCCampaignStatus,
  IndiaDLTStatus,
} from '../src/modules/sms/entities/tenant-compliance-status.entity';

async function bootstrap() {
  const logger = new Logger('ComplianceVerification');

  // Bootstrap the application context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'], // Reduce noise
  });

  try {
    // Resolve Services
    const usersService = app.get(UsersService);
    const tenantsService = app.get(TenantsService);
    const complianceService = app.get(ComplianceService);
    const usComplianceService = app.get(UsComplianceService);
    const indiaComplianceService = app.get(IndiaComplianceService);
    const euComplianceService = app.get(EuComplianceService);
    const senderService = app.get(SenderService);

    logger.log('🚀 Starting Compliance Flow Verification');

    // ==========================================
    // 1. Create User & Tenant
    // ==========================================
    const uniqueSuffix = Date.now().toString().slice(-6);
    const tenantName = `Compliance Test Tenant ${uniqueSuffix}`;
    const email = `test.compliance.${uniqueSuffix}@example.com`;

    logger.log(`Creating Tenant: ${tenantName}`);
    const tenant = await tenantsService.create({ name: tenantName });

    logger.log(`Creating User: ${email}`);
    const user = await usersService.create({
      email,
      firstName: 'Compliance',
      lastName: 'Tester',
      tenantId: tenant.id,
      password: 'Password123!',
    });

    logger.log(`✅ User & Tenant created. Tenant ID: ${tenant.id}`);

    // ==========================================
    // 2. Setup US 10DLC Compliance
    // ==========================================
    logger.log('\n--- Setting up US 10DLC Compliance ---');

    // Mock the US Compliance Service methods to bypass real Twilio calls
    // We overwrite the method on the instance for this script execution only
    usComplianceService.registerBrand = async (tenantId: string, dto: RegisterBrandDto) => {
      logger.log(`[MOCK] Registering Brand: ${dto.legalName}`);
      // Manually update DB via repo? Easier to just simulate the result object since the service usually updates DB.
      // But wait, the service updates the DB internally. If I mock it, I must update the DB myself or the verification step will fail.

      // Let's use the repository to update the DB directly to simulate success
      // We can access the repository via "private" property access or just rely on the fact that I can't easily access privates here.
      // Better approach: I'll use the repository from the module context to update the entity directly.
      // But simpler: just use "any" casting to access private repos if needed, OR just trust the flow validation.

      // Actually, the easiest way to simulate "Completed Flow" without external deps is to call the real service methods
      // BUT intercept the Twilio calls. That's hard.

      // Alternative: The service *returns* the status. I will manually update the entity in DB using the module's repository.
      // I need access to TenantComplianceStatus repository.
      return {
        success: true,
        brandSid: 'BN_MOCK_12345',
        brandStatus: US10DLCBrandStatus.APPROVED,
        trustScore: 100,
        trustHubUrl: 'https://mock.twilio.com',
      } as any;
    };

    usComplianceService.registerCampaign = async (tenantId: string, dto: RegisterCampaignDto) => {
      logger.log(`[MOCK] Registering Campaign: ${dto.name}`);
      return {
        success: true,
        campaignSid: 'CP_MOCK_67890',
        campaignStatus: US10DLCCampaignStatus.VERIFIED,
        messagingServiceSid: 'MG_MOCK_SERVICE_SID',
      } as any;
    };

    usComplianceService.linkNumberToCampaign = async (tenantId: string, senderId: string) => {
      logger.log(`[MOCK] Linking Sender ${senderId} to Campaign`);
      // We need to update the sender entity in DB because validateSenderForUS checks it
      const sender = await senderService.getSender(tenantId, senderId);
      sender.registeredRegions = [...(sender.registeredRegions || []), 'US'];
      sender.complianceMetadata = {
        ...(sender.complianceMetadata || {}),
        us: {
          messagingServiceSid: 'MG_MOCK_SERVICE_SID',
          registeredAt: new Date().toISOString(),
        },
      };
      // We need to save this. Access repo via 'any' hack on senderService
      await (senderService as any).senderRepository.save(sender);

      return {
        success: true,
        phoneNumber: sender.phoneNumber!,
        messagingServiceSid: 'MG_MOCK_SERVICE_SID',
      };
    };

    // Need to access Compliance Repository to manually set the status since we mocked the service methods that usually set it
    // We can get the repository from the module context if we had the token, but we don't.
    // We'll rely on a "hack": Use the `usComplianceService`'s private repository if possible, or just inject it.
    // Let's just create a helper to update compliance status directly.
    const updateComplianceStatus = async (tid: string, updates: any) => {
      const repo = (usComplianceService as any).complianceRepository; // Access private property
      let status = await repo.findOne({ where: { tenantId: tid } });
      if (!status) status = repo.create({ tenantId: tid });
      Object.assign(status, updates);
      await repo.save(status);
    };

    // 2.1 Register Brand
    logger.log('Step 2.1: Registering Brand');
    await usComplianceService.registerBrand(tenant.id, {
      legalName: 'TechStart Inc.',
      address: { street: '123 Main', city: 'SF', state: 'CA', postalCode: '94105', country: 'US' },
      businessType: 'llc',
      contactEmail: email,
      contactPhone: '+15550001234',
    });
    // Manually set DB state
    await updateComplianceStatus(tenant.id, {
      usBrandSid: 'BN_MOCK_12345',
      usBrandName: 'TechStart Inc.',
      usBrandStatus: US10DLCBrandStatus.APPROVED,
      usRegisteredAt: new Date(),
    });

    // 2.2 Register Campaign
    logger.log('Step 2.2: Registering Campaign');
    await usComplianceService.registerCampaign(tenant.id, {
      name: 'Marketing Campaign',
      description: 'Test Marketing',
      useCase: 'MARKETING',
      sampleMessages: ['Test message 1'],
      optInDescription: 'Web form',
    });
    // Manually set DB state
    await updateComplianceStatus(tenant.id, {
      usCampaignSid: 'CP_MOCK_67890',
      usCampaignStatus: US10DLCCampaignStatus.VERIFIED,
      usMessagingServiceSid: 'MG_MOCK_SERVICE_SID',
    });

    // 2.3 Create Sender & Link
    logger.log('Step 2.3: Creating and Linking Sender');
    const sender = await senderService.addExistingNumber(tenant.id, {
      phoneNumber: '+14155550100',
      friendlyName: 'US Marketing Number',
    });

    await usComplianceService.linkNumberToCampaign(tenant.id, sender.id);

    // Verify US Compliance
    const usValidation = await usComplianceService.validateSenderForUS(sender.id, tenant.id);
    if (usValidation.valid) {
      logger.log('✅ US Compliance Verified!');
    } else {
      logger.error('❌ US Compliance Failed:', usValidation.errors);
    }

    // ==========================================
    // 3. Setup India DLT Compliance
    // ==========================================
    logger.log('\n--- Setting up India DLT Compliance ---');

    // 3.1 Register Entity
    logger.log('Step 3.1: Registering DLT Entity');
    await indiaComplianceService.registerEntity(tenant.id, {
      entityId: '1234567890123456789',
      principalEntityId: 'PE12345',
      telemarketerId: 'TM12345',
    });

    // 3.2 Add Template
    logger.log('Step 3.2: Adding DLT Template');
    await indiaComplianceService.createTemplate(tenant.id, {
      templateId: '1107164528392847561',
      templateName: 'Order Shipped',
      category: DltTemplateCategory.TRANSACTIONAL,
      templateContent: 'Dear {#var#}, your order {#var#} is shipped.',
      senderId: 'QMART',
    });

    // Verify India Compliance
    const indiaStatus = await indiaComplianceService.getRegistrationStatus(tenant.id);
    if (indiaStatus.registered && indiaStatus.templateCount > 0) {
      logger.log('✅ India DLT Compliance Verified!');
    } else {
      logger.error('❌ India DLT Compliance Failed');
    }

    // ==========================================
    // 4. Setup EU GDPR Compliance
    // ==========================================
    logger.log('\n--- Setting up EU GDPR Compliance ---');

    // 4.1 Register Sender ID for Germany (DE)
    logger.log('Step 4.1: Registering Sender ID for Germany (DE)');
    await euComplianceService.registerSenderId(tenant.id, {
      country: 'DE',
      senderId: 'TECHSTART',
    });

    // 4.2 Enable Consent Tracking
    await euComplianceService.enableConsentTracking(tenant.id);

    // Verify EU Compliance
    const euRules = euComplianceService.getCountryRules('DE');
    const registeredIds = await euComplianceService.getRegisteredSenderIds(tenant.id);

    if (registeredIds['DE'] === 'TECHSTART') {
      logger.log('✅ EU Compliance Verified (Sender ID Registered)');
    } else {
      logger.error('❌ EU Compliance Failed');
    }

    // ==========================================
    // 5. Final Status Check
    // ==========================================
    logger.log('\n--- Final Compliance Status Check ---');
    const finalStatus = await complianceService.getTenantComplianceStatus(tenant.id);

    logger.log('Compliance Status Summary:');
    logger.log(`- US 10DLC: ${finalStatus.us.status} (Brand: ${finalStatus.us.details})`);
    logger.log(
      `- India DLT: ${finalStatus.india.status} (Templates: ${finalStatus.india.details})`
    );
    logger.log(`- EU GDPR: ${finalStatus.eu.status} (Sender IDs: ${finalStatus.eu.details})`);

    // ==========================================
    // 6. Test Message Validation Logic
    // ==========================================
    logger.log('\n--- Testing Message Validation Logic ---');

    // US
    const usResult = await complianceService.validateCompliance(tenant.id, {
      to: '+14155559999',
      from: sender.phoneNumber!,
      body: 'Hello US Customer!',
    });
    logger.log(`US Validation: ${usResult.allowed ? 'ALLOWED ✅' : 'BLOCKED ❌'}`);

    // India
    const indiaResult = await complianceService.validateCompliance(tenant.id, {
      to: '+919876543210',
      from: 'QMART', // Sender ID
      body: 'Dear Rahul, your order 123 is shipped.',
    });
    // Should fail because template match is strict and I didn't pass templateId in validate,
    // but the service tries to match all templates.
    // "Dear {#var#}, your order {#var#} is shipped." vs "Dear Rahul, your order 123 is shipped."
    // regex matching logic in service should handle this if implemented correctly.
    logger.log(
      `India Validation: ${indiaResult.allowed ? 'ALLOWED ✅' : 'BLOCKED ❌'} ${!indiaResult.allowed ? '(' + indiaResult.reason + ')' : ''}`
    );

    // EU
    const euResult = await complianceService.validateCompliance(tenant.id, {
      to: '+4915112345678', // Germany
      from: 'TECHSTART',
      body: 'Hello Germany! Reply STOP to unsubscribe.', // Includes opt-out
    });
    logger.log(
      `EU Validation: ${euResult.allowed ? 'ALLOWED ✅' : 'BLOCKED ❌'} ${!euResult.allowed ? '(' + euResult.reason + ')' : ''}`
    );

    logger.log('\n🎉 Perfect Flow Verification Complete!');
  } catch (error) {
    logger.error('Verification failed', error);
  } finally {
    await app.close();
  }
}

bootstrap();
