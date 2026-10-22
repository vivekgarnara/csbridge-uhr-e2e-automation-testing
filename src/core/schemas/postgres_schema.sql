-- NPHIES Database Schema Initialization Script for PostgreSQL
-- This script creates all required tables for the NPHIES healthcare system
-- Version: 1.0
-- Compatible with: PostgreSQL 12+

-- Enable error handling
DO $$
DECLARE
    v_error_message TEXT;
BEGIN
    -- Start transaction (implicit in DO block)
    
    -- Create midtable_nphies schema if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'midtable_nphies') THEN
        CREATE SCHEMA midtable_nphies;
        RAISE NOTICE 'Schema midtable_nphies created.';
    ELSE
        RAISE NOTICE 'Schema midtable_nphies already exists.';
    END IF;

    -- Create nphies_events table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_events') THEN
        CREATE TABLE midtable_nphies.nphies_events (
            eventid VARCHAR(50) NOT NULL,
            provclaimno VARCHAR(50) NOT NULL,
            eventtype VARCHAR(50) NOT NULL,
            createddate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            issubmitted BOOLEAN NOT NULL DEFAULT FALSE,
            CONSTRAINT pk_nphies_events PRIMARY KEY (eventid)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_events created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_events already exists. Skipping creation.';
    END IF;

    -- Create nphies_beneficiary table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_beneficiary') THEN
        CREATE TABLE midtable_nphies.nphies_beneficiary (
            beneficiaryid VARCHAR(20) NOT NULL,
            patientfileno VARCHAR(30) NOT NULL,
            firstname VARCHAR(50) NULL,
            middlename VARCHAR(50) NULL,
            lastname VARCHAR(50) NULL,
            fullname VARCHAR(200) NULL,
            dob TIMESTAMP NOT NULL,
            gender VARCHAR(10) NOT NULL,
            nationality VARCHAR(30) NULL,
            documenttype VARCHAR(30) NOT NULL,
            documentid VARCHAR(50) NOT NULL,
            contactnumber VARCHAR(50) NULL,
            ehealthid VARCHAR(50) NULL,
            residencytype VARCHAR(50) NULL,
            maritalstatus VARCHAR(10) NOT NULL,
            bloodgroup VARCHAR(10) NULL,
            preferredlanguage VARCHAR(20) NULL,
            email VARCHAR(50) NULL,
            addressline VARCHAR(250) NULL,
            addressstreetname VARCHAR(250) NULL,
            addresscity VARCHAR(250) NULL,
            addressdistrict VARCHAR(250) NULL,
            addressstate VARCHAR(250) NULL,
            addresspostalcode VARCHAR(100) NULL,
            addresscountry VARCHAR(250) NULL,
            occupation VARCHAR(20) NOT NULL,
            religion VARCHAR(5) NULL,
            CONSTRAINT pk_beneficiary PRIMARY KEY (beneficiaryid)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_beneficiary created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_beneficiary already exists. Skipping creation.';
    END IF;

    -- Create nphies_coverage table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_coverage') THEN
        CREATE TABLE midtable_nphies.nphies_coverage (
            coverageid VARCHAR(20) NOT NULL,
            memberid VARCHAR(50) NOT NULL,
            expirydate TIMESTAMP NULL,
            payernphiesid VARCHAR(20) NOT NULL,
            tpanphiesid VARCHAR(20) NULL,
            relationwithsubscriber VARCHAR(20) NOT NULL,
            policyholder VARCHAR(250) NOT NULL,
            policynumber VARCHAR(30) NULL,
            coveragetype VARCHAR(20) NOT NULL,
            beneficiaryid VARCHAR(20) NOT NULL,
            CONSTRAINT pk_coverage PRIMARY KEY (coverageid),
            CONSTRAINT fk_beneficiary_coverage FOREIGN KEY (beneficiaryid) REFERENCES midtable_nphies.nphies_beneficiary(beneficiaryid)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_coverage created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_coverage already exists. Skipping creation.';
    END IF;

    -- Create nphies_coverage_class table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_coverage_class') THEN
        CREATE TABLE midtable_nphies.nphies_coverage_class (
            coverageclassid VARCHAR(20) NOT NULL,
            type VARCHAR(50) NOT NULL,
            value VARCHAR(250) NOT NULL,
            name VARCHAR(250) NULL,
            coverageid VARCHAR(20) NOT NULL,
            CONSTRAINT pk_nphies_coverage_class PRIMARY KEY (coverageclassid),
            CONSTRAINT fk_nphies_coverage_class FOREIGN KEY (coverageid) REFERENCES midtable_nphies.nphies_coverage(coverageid)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_coverage_class created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_coverage_class already exists. Skipping creation.';
    END IF;

    -- Create nphies_claiminfo table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claiminfo') THEN
        CREATE TABLE midtable_nphies.nphies_claiminfo (
            provclaimno VARCHAR(40) NOT NULL,
            episodeid VARCHAR(40) NOT NULL,
            isnewborn VARCHAR(10) NULL,
            isreferral VARCHAR(10) NULL,
            referringprovidername VARCHAR(200) NULL,
            claimtype VARCHAR(20) NOT NULL,
            claimsubtype VARCHAR(20) NOT NULL,
            providernphiesid VARCHAR(20) NOT NULL,
            claimcreateddate TIMESTAMP NOT NULL,
            accountingperiod TIMESTAMP NOT NULL,
            billableperiodstart TIMESTAMP NULL,
            billableperiodend TIMESTAMP NULL,
            eligibilityresponseid VARCHAR(30) NULL,
            eligibilityidentifierurl VARCHAR(250) NULL,
            eligibilityofflineid VARCHAR(30) NULL,
            eligibilityofflinedate TIMESTAMP NULL,
            preauthofflinedate TIMESTAMP NULL,
            preauthresponseid VARCHAR(30) NULL,
            preauthidentifierurl VARCHAR(250) NULL,
            payeetype VARCHAR(10) NULL,
            payeeid VARCHAR(20) NULL,
            coverageid VARCHAR(20) NOT NULL,
            beneficiaryid VARCHAR(20) NOT NULL,
            subscriberid VARCHAR(20) NULL,
            total DECIMAL(14,2) NOT NULL,
            prescription VARCHAR(250) NULL,
            CONSTRAINT pk_claiminfo PRIMARY KEY (provclaimno),
            CONSTRAINT fk_beneficiary_claiminfo FOREIGN KEY (beneficiaryid) REFERENCES midtable_nphies.nphies_beneficiary(beneficiaryid),
            CONSTRAINT fk_benefi_subscrib_claiminfo FOREIGN KEY (subscriberid) REFERENCES midtable_nphies.nphies_beneficiary(beneficiaryid),
            CONSTRAINT fk_coverage_claiminfo FOREIGN KEY (coverageid) REFERENCES midtable_nphies.nphies_coverage(coverageid)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claiminfo created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claiminfo already exists. Skipping creation.';
    END IF;

    -- Create nphies_claimitem table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claimitem') THEN
        CREATE TABLE midtable_nphies.nphies_claimitem (
            provclaimno VARCHAR(40) NOT NULL,
            invoiceno VARCHAR(20) NOT NULL,
            sequenceno INT NOT NULL,
            servicetype VARCHAR(30) NOT NULL,
            servicecode VARCHAR(20) NOT NULL,
            servicedesc VARCHAR(200) NOT NULL,
            nonstandardcode VARCHAR(30) NULL,
            nonstandarddesc VARCHAR(256) NULL,
            udi VARCHAR(30) NULL,
            ispackage VARCHAR(5) NOT NULL,
            quantity DECIMAL(10,2) NOT NULL,
            quantitycode VARCHAR(10) NULL,
            unitprice DECIMAL(14,2) NOT NULL,
            discount DECIMAL(14,2) NULL,
            factor DECIMAL(14,6) NOT NULL,
            patientshare DECIMAL(14,2) NOT NULL,
            payershare DECIMAL(14,2) NOT NULL,
            tax DECIMAL(14,2) NOT NULL,
            net DECIMAL(14,2) NOT NULL,
            startdate TIMESTAMP NULL,
            enddate TIMESTAMP NOT NULL,
            bodysitecode VARCHAR(10) NULL,
            subsitecode VARCHAR(10) NULL,
            drugselectionreason VARCHAR(30) NULL,
            prescribeddrugcode VARCHAR(50) NULL,
            pharmacistselectionreason VARCHAR(50) NULL,
            pharmacistsubstitute VARCHAR(50) NULL,
            reasonpharmacistsubstitute VARCHAR(50) NULL,
            ismaternity VARCHAR(10) NULL,
            CONSTRAINT pk_claimitem PRIMARY KEY (provclaimno, sequenceno),
            CONSTRAINT fk_claimitem FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claimitem created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claimitem already exists. Skipping creation.';
    END IF;

    -- Create nphies_claimitemdetails table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claimitemdetails') THEN
        CREATE TABLE midtable_nphies.nphies_claimitemdetails (
            itemsequenceno INT NOT NULL,
            provclaimno VARCHAR(40) NOT NULL,
            sequenceno INT NOT NULL,
            servicetype VARCHAR(30) NOT NULL,
            servicecode VARCHAR(30) NOT NULL,
            servicedesc VARCHAR(256) NOT NULL,
            nonstandardcode VARCHAR(30) NULL,
            nonstandarddesc VARCHAR(256) NULL,
            udi VARCHAR(30) NULL,
            quantity DECIMAL(10,0) NOT NULL,
            quantitycode VARCHAR(10) NULL,
            unitprice DECIMAL(14,2) NULL,
            tax DECIMAL(14,2) NULL,
            net DECIMAL(14,2) NULL,
            prescribeddrugcode VARCHAR(50) NULL,
            pharmacistselectionreason VARCHAR(50) NULL,
            pharmacistsubstitute VARCHAR(50) NULL,
            reasonpharmacistsubstitute VARCHAR(50) NULL,
            CONSTRAINT pk_claimitemdetails PRIMARY KEY (provclaimno, sequenceno),
            CONSTRAINT fk_itemdetailsseq FOREIGN KEY (provclaimno, itemsequenceno) REFERENCES midtable_nphies.nphies_claimitem(provclaimno, sequenceno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claimitemdetails created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claimitemdetails already exists. Skipping creation.';
    END IF;

    -- Create nphies_claimpreauthdetails table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claimpreauthdetails') THEN
        CREATE TABLE midtable_nphies.nphies_claimpreauthdetails (
            provclaimno VARCHAR(40) NOT NULL,
            preauthrefno VARCHAR(20) NOT NULL,
            CONSTRAINT pk_claimpreauthdetails PRIMARY KEY (provclaimno, preauthrefno),
            CONSTRAINT fk_claimpreauth FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claimpreauthdetails created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claimpreauthdetails already exists. Skipping creation.';
    END IF;

    -- Create nphies_claimsupportinginfo table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claimsupportinginfo') THEN
        CREATE TABLE midtable_nphies.nphies_claimsupportinginfo (
            provclaimno VARCHAR(40) NOT NULL,
            sequenceno INT NOT NULL,
            category VARCHAR(40) NULL,
            reason VARCHAR(20) NULL,
            supportingvalue TEXT NULL,
            supportingattachment BYTEA NULL,
            attachmentfilename VARCHAR(30) NULL,
            attachmenttype VARCHAR(20) NULL,
            code VARCHAR(30) NULL,
            unit VARCHAR(30) NULL,
            timingperiodfrom TIMESTAMP NULL,
            timingperiodto TIMESTAMP NULL,
            CONSTRAINT pk_claimsupportinginfo PRIMARY KEY (provclaimno, sequenceno),
            CONSTRAINT fk_claimsupportinginfo FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claimsupportinginfo created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claimsupportinginfo already exists. Skipping creation.';
    END IF;

    -- Create nphies_itemsupportinginfo table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_itemsupportinginfo') THEN
        CREATE TABLE midtable_nphies.nphies_itemsupportinginfo (
            provclaimno VARCHAR(40) NOT NULL,
            supportinginfosequenceno INT NOT NULL,
            itemsequenceno INT NOT NULL,
            CONSTRAINT pk_itemsupportinginfo PRIMARY KEY (provclaimno, supportinginfosequenceno, itemsequenceno),
            CONSTRAINT fk_itemsupportinginfo FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno),
            CONSTRAINT fk_itemsupportingseq FOREIGN KEY (provclaimno, itemsequenceno) REFERENCES midtable_nphies.nphies_claimitem(provclaimno, sequenceno),
            CONSTRAINT fk_supportinginfoseq FOREIGN KEY (provclaimno, supportinginfosequenceno) REFERENCES midtable_nphies.nphies_claimsupportinginfo(provclaimno, sequenceno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_itemsupportinginfo created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_itemsupportinginfo already exists. Skipping creation.';
    END IF;

    -- Create nphies_claimaccidentdetail table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claimaccidentdetail') THEN
        CREATE TABLE midtable_nphies.nphies_claimaccidentdetail (
            provclaimno VARCHAR(40) NOT NULL,
            accidenttype VARCHAR(20) NOT NULL,
            accidentdate TIMESTAMP NOT NULL,
            addressstreetname VARCHAR(250) NULL,
            addresscity VARCHAR(250) NULL,
            addressstate VARCHAR(250) NULL,
            addresscountry VARCHAR(250) NULL,
            CONSTRAINT pk_claimaccidentdetail PRIMARY KEY (provclaimno),
            CONSTRAINT fk_claimaccidentdetail FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claimaccidentdetail created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claimaccidentdetail already exists. Skipping creation.';
    END IF;

    -- Create nphies_claimcareteam table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claimcareteam') THEN
        CREATE TABLE midtable_nphies.nphies_claimcareteam (
            provclaimno VARCHAR(40) NOT NULL,
            sequenceno INT NOT NULL,
            physicianid VARCHAR(30) NOT NULL,
            physicianname VARCHAR(60) NULL,
            practitionerrole VARCHAR(20) NULL,
            careteamrole VARCHAR(20) NOT NULL,
            careteamqualification VARCHAR(30) NOT NULL,
            CONSTRAINT pk_claimcareteam PRIMARY KEY (provclaimno, sequenceno),
            CONSTRAINT fk_claimcareteam FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claimcareteam created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claimcareteam already exists. Skipping creation.';
    END IF;

    -- Create nphies_claimdiagnosis table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claimdiagnosis') THEN
        CREATE TABLE midtable_nphies.nphies_claimdiagnosis (
            provclaimno VARCHAR(40) NOT NULL,
            sequenceno INT NOT NULL,
            diagnosiscode VARCHAR(30) NOT NULL,
            diagnosisdesc VARCHAR(256) NULL,
            diagnosistype VARCHAR(30) NULL,
            onadmission VARCHAR(10) NULL,
            conditiononset VARCHAR(10) NULL,
            CONSTRAINT pk_claimdiagnosis PRIMARY KEY (provclaimno, sequenceno),
            CONSTRAINT fk_claimdiagnosis FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claimdiagnosis created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claimdiagnosis already exists. Skipping creation.';
    END IF;

    -- Create nphies_claimencounters table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claimencounters') THEN
        CREATE TABLE midtable_nphies.nphies_claimencounters (
            provclaimno VARCHAR(40) NOT NULL,
            encounterid VARCHAR(20) NOT NULL,
            encounterstartdate TIMESTAMP NOT NULL,
            encounterenddate TIMESTAMP NOT NULL,
            encounterclass VARCHAR(20) NOT NULL,
            encounterservicetype VARCHAR(20) NULL,
            priority VARCHAR(20) NULL,
            serviceprovider VARCHAR(20) NULL,
            encounterstatus VARCHAR(20) NOT NULL,
            causeofdeath VARCHAR(10) NULL,
            serviceeventtype VARCHAR(10) NULL,
            CONSTRAINT pk_claimencounters PRIMARY KEY (provclaimno, encounterid),
            CONSTRAINT unique_encounters_encounterid UNIQUE (encounterid),
            CONSTRAINT fk_claimencounters FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claimencounters created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claimencounters already exists. Skipping creation.';
    END IF;

    -- Create nphies_claimvisionprescription table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_claimvisionprescription') THEN
        CREATE TABLE midtable_nphies.nphies_claimvisionprescription (
            provclaimno VARCHAR(40) NOT NULL,
            visionprescriptionid VARCHAR(20) NOT NULL,
            datewritten TIMESTAMP NOT NULL,
            careteamsequence INT NOT NULL,
            product VARCHAR(10) NOT NULL,
            eye VARCHAR(10) NOT NULL,
            sphere DECIMAL(14,2) NULL,
            cylinder DECIMAL(14,2) NULL,
            axis INT NULL,
            prismamount DECIMAL(14,2) NULL,
            prismbase VARCHAR(10) NULL,
            multifocalpower DECIMAL(14,2) NULL,
            lenspower DECIMAL(14,2) NULL,
            lensbackcurve DECIMAL(14,2) NULL,
            lensdiameter DECIMAL(14,2) NULL,
            lensduration INT NULL,
            lenscolor VARCHAR(10) NULL,
            lensbrand VARCHAR(50) NULL,
            lensnote VARCHAR(256) NULL,
            lensdurationunit VARCHAR(10) NULL,
            CONSTRAINT pk_claimvisionprescription PRIMARY KEY (provclaimno, visionprescriptionid),
            CONSTRAINT fk_careteamvision FOREIGN KEY (provclaimno, careteamsequence) REFERENCES midtable_nphies.nphies_claimcareteam(provclaimno, sequenceno),
            CONSTRAINT fk_claimvisionprescription FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_claimvisionprescription created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_claimvisionprescription already exists. Skipping creation.';
    END IF;

    -- Create nphies_encounteremergency table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_encounteremergency') THEN
        CREATE TABLE midtable_nphies.nphies_encounteremergency (
            encounteremergencyid VARCHAR(20) NOT NULL,
            emergencyarrivalcode VARCHAR(20) NOT NULL,
            emergencyservicestart TIMESTAMP NOT NULL,
            emergencydepartmentdisposition VARCHAR(20) NULL,
            triagecategory VARCHAR(20) NOT NULL,
            triagedate TIMESTAMP NOT NULL,
            encounterid VARCHAR(20) NOT NULL,
            CONSTRAINT pk_encounteremergency PRIMARY KEY (encounteremergencyid),
            CONSTRAINT fk_encountermergency FOREIGN KEY (encounterid) REFERENCES midtable_nphies.nphies_claimencounters(encounterid)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_encounteremergency created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_encounteremergency already exists. Skipping creation.';
    END IF;

    -- Create nphies_itemcareteam table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_itemcareteam') THEN
        CREATE TABLE midtable_nphies.nphies_itemcareteam (
            provclaimno VARCHAR(40) NOT NULL,
            careteamsequenceno INT NOT NULL,
            itemsequenceno INT NOT NULL,
            CONSTRAINT pk_itemcareteam PRIMARY KEY (provclaimno, careteamsequenceno, itemsequenceno),
            CONSTRAINT fk_careteamseq FOREIGN KEY (provclaimno, careteamsequenceno) REFERENCES midtable_nphies.nphies_claimcareteam(provclaimno, sequenceno),
            CONSTRAINT fk_itemcareseq FOREIGN KEY (provclaimno, itemsequenceno) REFERENCES midtable_nphies.nphies_claimitem(provclaimno, sequenceno),
            CONSTRAINT fk_itemcareteam FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_itemcareteam created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_itemcareteam already exists. Skipping creation.';
    END IF;

    -- Create nphies_itemdiagnosis table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphies_itemdiagnosis') THEN
        CREATE TABLE midtable_nphies.nphies_itemdiagnosis (
            provclaimno VARCHAR(40) NOT NULL,
            diagnosissequenceno INT NOT NULL,
            itemsequenceno INT NOT NULL,
            CONSTRAINT pk_itemdiagnosis PRIMARY KEY (provclaimno, diagnosissequenceno, itemsequenceno),
            CONSTRAINT fk_diagnosisseq FOREIGN KEY (provclaimno, diagnosissequenceno) REFERENCES midtable_nphies.nphies_claimdiagnosis(provclaimno, sequenceno),
            CONSTRAINT fk_itemdiagnosis FOREIGN KEY (provclaimno) REFERENCES midtable_nphies.nphies_claiminfo(provclaimno),
            CONSTRAINT fk_itemdiaseq FOREIGN KEY (provclaimno, itemsequenceno) REFERENCES midtable_nphies.nphies_claimitem(provclaimno, sequenceno)
        );
        RAISE NOTICE 'Table midtable_nphies.nphies_itemdiagnosis created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphies_itemdiagnosis already exists. Skipping creation.';
    END IF;

    -- Create nphiesencounterhospitalization table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'midtable_nphies' AND table_name = 'nphiesencounterhospitalization') THEN
        CREATE TABLE midtable_nphies.nphiesencounterhospitalization (
            encounterhospitalizationid VARCHAR(20) NOT NULL,
            hospitaladmissionspeciality VARCHAR(20) NOT NULL,
            hospitaldischargespeciality VARCHAR(20) NULL,
            hospitalintendedlengthofstay VARCHAR(20) NOT NULL,
            hospitalizationorigin VARCHAR(20) NULL,
            hospitaladmissionsource VARCHAR(20) NOT NULL,
            hospitalreadmission VARCHAR(20) NULL,
            hospitaldischargedisposition VARCHAR(20) NULL,
            encounterid VARCHAR(20) NOT NULL,
            CONSTRAINT pk_encounterhospitalization PRIMARY KEY (encounterhospitalizationid),
            CONSTRAINT fk_encounterhospitalization FOREIGN KEY (encounterid) REFERENCES midtable_nphies.nphies_claimencounters(encounterid)
        );
        RAISE NOTICE 'Table midtable_nphies.nphiesencounterhospitalization created successfully.';
    ELSE
        RAISE NOTICE 'Table midtable_nphies.nphiesencounterhospitalization already exists. Skipping creation.';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Database schema initialization completed successfully!';
    RAISE NOTICE 'All NPHIES tables have been created in schema midtable_nphies.';
    RAISE NOTICE '========================================';

EXCEPTION
    WHEN OTHERS THEN
        v_error_message := SQLERRM;
        RAISE NOTICE '';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'ERROR: Database schema initialization failed!';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Error Message: %', v_error_message;
        RAISE NOTICE 'Error Detail: %', SQLSTATE;
        RAISE NOTICE '========================================';
        -- Re-raise the exception to ensure rollback
        RAISE;
END $$;
