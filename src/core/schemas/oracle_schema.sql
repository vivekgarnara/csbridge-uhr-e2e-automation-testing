-- NPHIES Database Schema Initialization Script for Oracle
-- This script creates all required tables for the NPHIES healthcare system
-- Version: 1.0

-- Note: Ensure the user has quota on the tablespace:
-- ALTER USER APP_USER QUOTA UNLIMITED ON USERS;

BEGIN
    -- Cleanup attempts (Optional, commented out)
    -- EXECUTE IMMEDIATE 'DROP TABLE nphies_events CASCADE CONSTRAINTS';
    -- ...
    NULL;
END;
/

-- Create nphies_events table
CREATE TABLE nphies_events (
    eventid VARCHAR2(50 CHAR) NOT NULL,
    provclaimno VARCHAR2(50 CHAR) NOT NULL,
    eventtype VARCHAR2(50 CHAR) NOT NULL,
    createddate TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    issubmitted NUMBER(1) DEFAULT 0 NOT NULL,
    CONSTRAINT pk_nphies_events PRIMARY KEY (eventid),
    CONSTRAINT chk_issubmitted CHECK (issubmitted IN (0, 1))
);

-- Create nphies_beneficiary table
CREATE TABLE nphies_beneficiary (
    beneficiaryid VARCHAR2(20 CHAR) NOT NULL,
    patientfileno VARCHAR2(30 CHAR) NOT NULL,
    firstname VARCHAR2(50 CHAR) NULL,
    middlename VARCHAR2(50 CHAR) NULL,
    lastname VARCHAR2(50 CHAR) NULL,
    fullname VARCHAR2(200 CHAR) NULL,
    dob TIMESTAMP NOT NULL,
    gender VARCHAR2(10 CHAR) NOT NULL,
    nationality VARCHAR2(30 CHAR) NULL,
    documenttype VARCHAR2(30 CHAR) NOT NULL,
    documentid VARCHAR2(50 CHAR) NOT NULL,
    contactnumber VARCHAR2(50 CHAR) NULL,
    ehealthid VARCHAR2(50 CHAR) NULL,
    residencytype VARCHAR2(50 CHAR) NULL,
    maritalstatus VARCHAR2(10 CHAR) NOT NULL,
    bloodgroup VARCHAR2(10 CHAR) NULL,
    preferredlanguage VARCHAR2(20 CHAR) NULL,
    email VARCHAR2(50 CHAR) NULL,
    addressline VARCHAR2(250 CHAR) NULL,
    addressstreetname VARCHAR2(250 CHAR) NULL,
    addresscity VARCHAR2(250 CHAR) NULL,
    addressdistrict VARCHAR2(250 CHAR) NULL,
    addressstate VARCHAR2(250 CHAR) NULL,
    addresspostalcode VARCHAR2(100 CHAR) NULL,
    addresscountry VARCHAR2(250 CHAR) NULL,
    occupation VARCHAR2(20 CHAR) NOT NULL,
    religion VARCHAR2(5 CHAR) NULL,
    CONSTRAINT pk_beneficiary PRIMARY KEY (beneficiaryid)
);

-- Create nphies_coverage table
CREATE TABLE nphies_coverage (
    coverageid VARCHAR2(20 CHAR) NOT NULL,
    memberid VARCHAR2(50 CHAR) NOT NULL,
    expirydate TIMESTAMP NULL,
    payernphiesid VARCHAR2(20 CHAR) NOT NULL,
    tpanphiesid VARCHAR2(20 CHAR) NULL,
    relationwithsubscriber VARCHAR2(20 CHAR) NOT NULL,
    policyholder VARCHAR2(250 CHAR) NOT NULL,
    policynumber VARCHAR2(30 CHAR) NULL,
    coveragetype VARCHAR2(20 CHAR) NOT NULL,
    beneficiaryid VARCHAR2(20 CHAR) NOT NULL,
    CONSTRAINT pk_coverage PRIMARY KEY (coverageid),
    CONSTRAINT fk_beneficiary_coverage FOREIGN KEY (beneficiaryid) REFERENCES nphies_beneficiary(beneficiaryid)
);

-- Create nphies_coverage_class table
CREATE TABLE nphies_coverage_class (
    coverageclassid VARCHAR2(20 CHAR) NOT NULL,
    type VARCHAR2(50 CHAR) NOT NULL,
    value VARCHAR2(250 CHAR) NOT NULL,
    name VARCHAR2(250 CHAR) NULL,
    coverageid VARCHAR2(20 CHAR) NOT NULL,
    CONSTRAINT pk_nphies_coverage_class PRIMARY KEY (coverageclassid),
    CONSTRAINT fk_nphies_coverage_class FOREIGN KEY (coverageid) REFERENCES nphies_coverage(coverageid)
);

-- Create nphies_claiminfo table
CREATE TABLE nphies_claiminfo (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    episodeid VARCHAR2(40 CHAR) NOT NULL,
    isnewborn VARCHAR2(10 CHAR) NULL,
    isreferral VARCHAR2(10 CHAR) NULL,
    referringprovidername VARCHAR2(200 CHAR) NULL,
    claimtype VARCHAR2(20 CHAR) NOT NULL,
    claimsubtype VARCHAR2(20 CHAR) NOT NULL,
    providernphiesid VARCHAR2(20 CHAR) NOT NULL,
    claimcreateddate TIMESTAMP NOT NULL,
    accountingperiod TIMESTAMP NOT NULL,
    billableperiodstart TIMESTAMP NULL,
    billableperiodend TIMESTAMP NULL,
    eligibilityresponseid VARCHAR2(30 CHAR) NULL,
    eligibilityidentifierurl VARCHAR2(250 CHAR) NULL,
    eligibilityofflineid VARCHAR2(30 CHAR) NULL,
    eligibilityofflinedate TIMESTAMP NULL,
    preauthofflinedate TIMESTAMP NULL,
    preauthresponseid VARCHAR2(30 CHAR) NULL,
    preauthidentifierurl VARCHAR2(250 CHAR) NULL,
    payeetype VARCHAR2(10 CHAR) NULL,
    payeeid VARCHAR2(20 CHAR) NULL,
    coverageid VARCHAR2(20 CHAR) NOT NULL,
    beneficiaryid VARCHAR2(20 CHAR) NOT NULL,
    subscriberid VARCHAR2(20 CHAR) NULL,
    total NUMBER(14,2) NOT NULL,
    prescription VARCHAR2(250 CHAR) NULL,
    CONSTRAINT pk_claiminfo PRIMARY KEY (provclaimno),
    CONSTRAINT fk_beneficiary_claiminfo FOREIGN KEY (beneficiaryid) REFERENCES nphies_beneficiary(beneficiaryid),
    CONSTRAINT fk_benefi_subscrib_claiminfo FOREIGN KEY (subscriberid) REFERENCES nphies_beneficiary(beneficiaryid),
    CONSTRAINT fk_coverage_claiminfo FOREIGN KEY (coverageid) REFERENCES nphies_coverage(coverageid)
);

-- Create nphies_claimitem table
CREATE TABLE nphies_claimitem (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    invoiceno VARCHAR2(20 CHAR) NOT NULL,
    sequenceno NUMBER(10) NOT NULL,
    servicetype VARCHAR2(30 CHAR) NOT NULL,
    servicecode VARCHAR2(20 CHAR) NOT NULL,
    servicedesc VARCHAR2(200 CHAR) NOT NULL,
    nonstandardcode VARCHAR2(30 CHAR) NULL,
    nonstandarddesc VARCHAR2(256 CHAR) NULL,
    udi VARCHAR2(30 CHAR) NULL,
    ispackage VARCHAR2(5 CHAR) NOT NULL,
    quantity NUMBER(10,2) NOT NULL,
    quantitycode VARCHAR2(10 CHAR) NULL,
    unitprice NUMBER(14,2) NOT NULL,
    discount NUMBER(14,2) NULL,
    factor NUMBER(14,6) NOT NULL,
    patientshare NUMBER(14,2) NOT NULL,
    payershare NUMBER(14,2) NOT NULL,
    tax NUMBER(14,2) NOT NULL,
    net NUMBER(14,2) NOT NULL,
    startdate TIMESTAMP NULL,
    enddate TIMESTAMP NOT NULL,
    bodysitecode VARCHAR2(10 CHAR) NULL,
    subsitecode VARCHAR2(10 CHAR) NULL,
    drugselectionreason VARCHAR2(30 CHAR) NULL,
    prescribeddrugcode VARCHAR2(50 CHAR) NULL,
    pharmacistselectionreason VARCHAR2(50 CHAR) NULL,
    pharmacistsubstitute VARCHAR2(50 CHAR) NULL,
    reasonpharmacistsubstitute VARCHAR2(50 CHAR) NULL,
    ismaternity VARCHAR2(10 CHAR) NULL,
    CONSTRAINT pk_claimitem PRIMARY KEY (provclaimno, sequenceno),
    CONSTRAINT fk_claimitem FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno)
);

-- Create nphies_claimitemdetails table
CREATE TABLE nphies_claimitemdetails (
    itemsequenceno NUMBER(10) NOT NULL,
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    sequenceno NUMBER(10) NOT NULL,
    servicetype VARCHAR2(30 CHAR) NOT NULL,
    servicecode VARCHAR2(30 CHAR) NOT NULL,
    servicedesc VARCHAR2(256 CHAR) NOT NULL,
    nonstandardcode VARCHAR2(30 CHAR) NULL,
    nonstandarddesc VARCHAR2(256 CHAR) NULL,
    udi VARCHAR2(30 CHAR) NULL,
    quantity NUMBER(10,0) NOT NULL,
    quantitycode VARCHAR2(10 CHAR) NULL,
    unitprice NUMBER(14,2) NULL,
    tax NUMBER(14,2) NULL,
    net NUMBER(14,2) NULL,
    prescribeddrugcode VARCHAR2(50 CHAR) NULL,
    pharmacistselectionreason VARCHAR2(50 CHAR) NULL,
    pharmacistsubstitute VARCHAR2(50 CHAR) NULL,
    reasonpharmacistsubstitute VARCHAR2(50 CHAR) NULL,
    CONSTRAINT pk_claimitemdetails PRIMARY KEY (provclaimno, sequenceno),
    CONSTRAINT fk_itemdetailsseq FOREIGN KEY (provclaimno, itemsequenceno) REFERENCES nphies_claimitem(provclaimno, sequenceno)
);

-- Create nphies_claimpreauthdetails table
CREATE TABLE nphies_claimpreauthdetails (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    preauthrefno VARCHAR2(20 CHAR) NOT NULL,
    CONSTRAINT pk_claimpreauthdetails PRIMARY KEY (provclaimno, preauthrefno),
    CONSTRAINT fk_claimpreauth FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno)
);

-- Create nphies_claimsupportinginfo table
CREATE TABLE nphies_claimsupportinginfo (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    sequenceno NUMBER(10) NOT NULL,
    category VARCHAR2(40 CHAR) NULL,
    reason VARCHAR2(20 CHAR) NULL,
    supportingvalue CLOB NULL,
    supportingattachment BLOB NULL,
    attachmentfilename VARCHAR2(30 CHAR) NULL,
    attachmenttype VARCHAR2(20 CHAR) NULL,
    code VARCHAR2(30 CHAR) NULL,
    unit VARCHAR2(30 CHAR) NULL,
    timingperiodfrom TIMESTAMP NULL,
    timingperiodto TIMESTAMP NULL,
    CONSTRAINT pk_claimsupportinginfo PRIMARY KEY (provclaimno, sequenceno),
    CONSTRAINT fk_claimsupportinginfo FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno)
);

-- Create nphies_itemsupportinginfo table
CREATE TABLE nphies_itemsupportinginfo (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    supportinginfosequenceno NUMBER(10) NOT NULL,
    itemsequenceno NUMBER(10) NOT NULL,
    CONSTRAINT pk_itemsupportinginfo PRIMARY KEY (provclaimno, supportinginfosequenceno, itemsequenceno),
    CONSTRAINT fk_itemsupportinginfo FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno),
    CONSTRAINT fk_itemsupportingseq FOREIGN KEY (provclaimno, itemsequenceno) REFERENCES nphies_claimitem(provclaimno, sequenceno),
    CONSTRAINT fk_supportinginfoseq FOREIGN KEY (provclaimno, supportinginfosequenceno) REFERENCES nphies_claimsupportinginfo(provclaimno, sequenceno)
);

-- Create nphies_claimaccidentdetail table
CREATE TABLE nphies_claimaccidentdetail (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    accidenttype VARCHAR2(20 CHAR) NOT NULL,
    accidentdate TIMESTAMP NOT NULL,
    addressstreetname VARCHAR2(250 CHAR) NULL,
    addresscity VARCHAR2(250 CHAR) NULL,
    addressstate VARCHAR2(250 CHAR) NULL,
    addresscountry VARCHAR2(250 CHAR) NULL,
    CONSTRAINT pk_claimaccidentdetail PRIMARY KEY (provclaimno),
    CONSTRAINT fk_claimaccidentdetail FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno)
);

-- Create nphies_claimcareteam table
CREATE TABLE nphies_claimcareteam (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    sequenceno NUMBER(10) NOT NULL,
    physicianid VARCHAR2(30 CHAR) NOT NULL,
    physicianname VARCHAR2(60 CHAR) NULL,
    practitionerrole VARCHAR2(20 CHAR) NULL,
    careteamrole VARCHAR2(20 CHAR) NOT NULL,
    careteamqualification VARCHAR2(30 CHAR) NOT NULL,
    CONSTRAINT pk_claimcareteam PRIMARY KEY (provclaimno, sequenceno),
    CONSTRAINT fk_claimcareteam FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno)
);

-- Create nphies_claimdiagnosis table
CREATE TABLE nphies_claimdiagnosis (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    sequenceno NUMBER(10) NOT NULL,
    diagnosiscode VARCHAR2(30 CHAR) NOT NULL,
    diagnosisdesc VARCHAR2(256 CHAR) NULL,
    diagnosistype VARCHAR2(30 CHAR) NULL,
    onadmission VARCHAR2(10 CHAR) NULL,
    conditiononset VARCHAR2(10 CHAR) NULL,
    CONSTRAINT pk_claimdiagnosis PRIMARY KEY (provclaimno, sequenceno),
    CONSTRAINT fk_claimdiagnosis FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno)
);

-- Create nphies_claimencounters table
CREATE TABLE nphies_claimencounters (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    encounterid VARCHAR2(20 CHAR) NOT NULL,
    encounterstartdate TIMESTAMP NOT NULL,
    encounterenddate TIMESTAMP NOT NULL,
    encounterclass VARCHAR2(20 CHAR) NOT NULL,
    encounterservicetype VARCHAR2(20 CHAR) NULL,
    priority VARCHAR2(20 CHAR) NULL,
    serviceprovider VARCHAR2(20 CHAR) NULL,
    encounterstatus VARCHAR2(20 CHAR) NOT NULL,
    causeofdeath VARCHAR2(10 CHAR) NULL,
    serviceeventtype VARCHAR2(10 CHAR) NULL,
    CONSTRAINT pk_claimencounters PRIMARY KEY (provclaimno, encounterid),
    CONSTRAINT unique_encounters_encounterid UNIQUE (encounterid),
    CONSTRAINT fk_claimencounters FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno)
);

-- Create nphies_claimvisionprescription table
CREATE TABLE nphies_claimvisionprescription (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    visionprescriptionid VARCHAR2(20 CHAR) NOT NULL,
    datewritten TIMESTAMP NOT NULL,
    careteamsequence NUMBER NOT NULL,
    product VARCHAR2(10 CHAR) NOT NULL,
    eye VARCHAR2(10 CHAR) NOT NULL,
    sphere NUMBER(14,2) NULL,
    cylinder NUMBER(14,2) NULL,
    axis NUMBER(10) NULL,
    prismamount NUMBER(14,2) NULL,
    prismbase VARCHAR2(10 CHAR) NULL,
    multifocalpower NUMBER(14,2) NULL,
    lenspower NUMBER(14,2) NULL,
    lensbackcurve NUMBER(14,2) NULL,
    lensdiameter NUMBER(14,2) NULL,
    lensduration NUMBER(10) NULL,
    lenscolor VARCHAR2(10 CHAR) NULL,
    lensbrand VARCHAR2(50 CHAR) NULL,
    lensnote VARCHAR2(256 CHAR) NULL,
    lensdurationunit VARCHAR2(10 CHAR) NULL,
    CONSTRAINT pk_claimvisionprescript PRIMARY KEY (provclaimno, visionprescriptionid),
    CONSTRAINT fk_careteamvision FOREIGN KEY (provclaimno, careteamsequence) REFERENCES nphies_claimcareteam(provclaimno, sequenceno),
    CONSTRAINT fk_claimvisionprescript FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno)
);

-- Create nphies_encounteremergency table
CREATE TABLE nphies_encounteremergency (
    encounteremergencyid VARCHAR2(20 CHAR) NOT NULL,
    emergencyarrivalcode VARCHAR2(20 CHAR) NOT NULL,
    emergencyservicestart TIMESTAMP NOT NULL,
    emergencydepartmentdisposition VARCHAR2(20 CHAR) NULL,
    triagecategory VARCHAR2(20 CHAR) NOT NULL,
    triagedate TIMESTAMP NOT NULL,
    encounterid VARCHAR2(20 CHAR) NOT NULL,
    CONSTRAINT pk_encounteremergency PRIMARY KEY (encounteremergencyid),
    CONSTRAINT fk_encountermergency FOREIGN KEY (encounterid) REFERENCES nphies_claimencounters(encounterid)
);

-- Create nphies_itemcareteam table
CREATE TABLE nphies_itemcareteam (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    careteamsequenceno NUMBER(10) NOT NULL,
    itemsequenceno NUMBER(10) NOT NULL,
    CONSTRAINT pk_itemcareteam PRIMARY KEY (provclaimno, careteamsequenceno, itemsequenceno),
    CONSTRAINT fk_careteamseq FOREIGN KEY (provclaimno, careteamsequenceno) REFERENCES nphies_claimcareteam(provclaimno, sequenceno),
    CONSTRAINT fk_itemcareseq FOREIGN KEY (provclaimno, itemsequenceno) REFERENCES nphies_claimitem(provclaimno, sequenceno),
    CONSTRAINT fk_itemcareteam FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno)
);

-- Create nphies_itemdiagnosis table
CREATE TABLE nphies_itemdiagnosis (
    provclaimno VARCHAR2(40 CHAR) NOT NULL,
    diagnosissequenceno NUMBER(10) NOT NULL,
    itemsequenceno NUMBER(10) NOT NULL,
    CONSTRAINT pk_itemdiagnosis PRIMARY KEY (provclaimno, diagnosissequenceno, itemsequenceno),
    CONSTRAINT fk_diagnosisseq FOREIGN KEY (provclaimno, diagnosissequenceno) REFERENCES nphies_claimdiagnosis(provclaimno, sequenceno),
    CONSTRAINT fk_itemdiagnosis FOREIGN KEY (provclaimno) REFERENCES nphies_claiminfo(provclaimno),
    CONSTRAINT fk_itemdiaseq FOREIGN KEY (provclaimno, itemsequenceno) REFERENCES nphies_claimitem(provclaimno, sequenceno)
);

-- Create nphiesencounterhospitalization table
CREATE TABLE nphiesencounterhospitalization (
    encounterhospitalizationid VARCHAR2(20 CHAR) NOT NULL,
    hospitaladmissionspeciality VARCHAR2(20 CHAR) NOT NULL,
    hospitaldischargespeciality VARCHAR2(20 CHAR) NULL,
    hospitalintendedlengthofstay VARCHAR2(20 CHAR) NOT NULL,
    hospitalizationorigin VARCHAR2(20 CHAR) NULL,
    hospitaladmissionsource VARCHAR2(20 CHAR) NOT NULL,
    hospitalreadmission VARCHAR2(20 CHAR) NULL,
    hospitaldischargedisposition VARCHAR2(20 CHAR) NULL,
    encounterid VARCHAR2(20 CHAR) NOT NULL,
    CONSTRAINT pk_encounterhospitaliza PRIMARY KEY (encounterhospitalizationid),
    CONSTRAINT fk_encounterhospitaliza FOREIGN KEY (encounterid) REFERENCES nphies_claimencounters(encounterid)
);
