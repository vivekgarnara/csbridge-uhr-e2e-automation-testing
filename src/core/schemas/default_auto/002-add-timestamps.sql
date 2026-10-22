-- SQL*Plus directives removed for JDBC/Liquibase compatibility
-- Uses the connected schema; no explicit schema qualifiers.

DECLARE
    v_error_message VARCHAR2(4000);
    v_column_exists NUMBER;
    v_trigger_exists NUMBER;
BEGIN
    DBMS_OUTPUT.PUT_LINE('Starting timestamp columns addition...');
    DBMS_OUTPUT.PUT_LINE('');

    -- ============================================
    -- nphies_events - only created_date (no updated_date)
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_EVENTS' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_events ADD created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL';
        DBMS_OUTPUT.PUT_LINE('✓ Added created_date to nphies_events');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_events.created_date already exists');
    END IF;

    -- ============================================
    -- nphies_beneficiary
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_BENEFICIARY' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_beneficiary ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        -- Drop trigger if it exists
        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_BENEFICIARY_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_beneficiary_upd';
        END IF;

        -- Create trigger
        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_beneficiary_upd
            BEFORE UPDATE ON nphies_beneficiary
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_beneficiary');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_beneficiary timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_coverage
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_COVERAGE' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_coverage ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_COVERAGE_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_coverage_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_coverage_upd
            BEFORE UPDATE ON nphies_coverage
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_coverage');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_coverage timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_coverage_class
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_COVERAGE_CLASS' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_coverage_class ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_COVERAGE_CLASS_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_coverage_class_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_coverage_class_upd
            BEFORE UPDATE ON nphies_coverage_class
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_coverage_class');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_coverage_class timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claiminfo
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMINFO' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claiminfo ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMINFO_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claiminfo_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claiminfo_upd
            BEFORE UPDATE ON nphies_claiminfo
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claiminfo');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claiminfo timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claimitem
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMITEM' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claimitem ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMITEM_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claimitem_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claimitem_upd
            BEFORE UPDATE ON nphies_claimitem
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claimitem');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claimitem timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claimitemdetails
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMITEMDETAILS' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claimitemdetails ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMITEMDET_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claimitemdet_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claimitemdet_upd
            BEFORE UPDATE ON nphies_claimitemdetails
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claimitemdetails');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claimitemdetails timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claimpreauthdetails
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMPREAUTHDETAILS' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claimpreauthdetails ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMPREAUTH_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claimpreauth_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claimpreauth_upd
            BEFORE UPDATE ON nphies_claimpreauthdetails
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claimpreauthdetails');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claimpreauthdetails timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claimsupportinginfo
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMSUPPORTINGINFO' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claimsupportinginfo ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMSUPPORT_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claimsupport_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claimsupport_upd
            BEFORE UPDATE ON nphies_claimsupportinginfo
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claimsupportinginfo');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claimsupportinginfo timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_itemsupportinginfo
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_ITEMSUPPORTINGINFO' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_itemsupportinginfo ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_ITEMSUPPORT_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_itemsupport_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_itemsupport_upd
            BEFORE UPDATE ON nphies_itemsupportinginfo
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_itemsupportinginfo');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_itemsupportinginfo timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claimaccidentdetail
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMACCIDENTDETAIL' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claimaccidentdetail ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMACCIDENT_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claimaccident_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claimaccident_upd
            BEFORE UPDATE ON nphies_claimaccidentdetail
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claimaccidentdetail');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claimaccidentdetail timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claimcareteam
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMCARETEAM' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claimcareteam ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMCARETEAM_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claimcareteam_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claimcareteam_upd
            BEFORE UPDATE ON nphies_claimcareteam
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claimcareteam');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claimcareteam timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claimdiagnosis
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMDIAGNOSIS' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claimdiagnosis ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMDIAG_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claimdiag_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claimdiag_upd
            BEFORE UPDATE ON nphies_claimdiagnosis
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claimdiagnosis');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claimdiagnosis timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claimencounters
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMENCOUNTERS' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claimencounters ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMENCTR_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claimenctr_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claimenctr_upd
            BEFORE UPDATE ON nphies_claimencounters
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claimencounters');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claimencounters timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_claimvisionprescription
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_CLAIMVISIONPRESCRIPTION' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_claimvisionprescription ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_CLAIMVISION_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_claimvision_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_claimvision_upd
            BEFORE UPDATE ON nphies_claimvisionprescription
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_claimvisionprescription');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_claimvisionprescription timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_encounteremergency
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_ENCOUNTEREMERGENCY' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_encounteremergency ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_ENCOUNTEREMG_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_encounteremg_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_encounteremg_upd
            BEFORE UPDATE ON nphies_encounteremergency
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_encounteremergency');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_encounteremergency timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_itemcareteam
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_ITEMCARETEAM' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_itemcareteam ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_ITEMCARETEAM_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_itemcareteam_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_itemcareteam_upd
            BEFORE UPDATE ON nphies_itemcareteam
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_itemcareteam');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_itemcareteam timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphies_itemdiagnosis
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIES_ITEMDIAGNOSIS' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphies_itemdiagnosis ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_ITEMDIAG_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_itemdiag_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_itemdiag_upd
            BEFORE UPDATE ON nphies_itemdiagnosis
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphies_itemdiagnosis');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphies_itemdiagnosis timestamp columns already exist');
    END IF;

    -- ============================================
    -- nphiesencounterhospitalization
    -- ============================================
    SELECT COUNT(*) INTO v_column_exists
    FROM user_tab_columns
    WHERE table_name = 'NPHIESENCOUNTERHOSPITALIZATION' AND column_name = 'CREATED_DATE';

    IF v_column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE nphiesencounterhospitalization ADD (
            created_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )';

        SELECT COUNT(*) INTO v_trigger_exists
        FROM user_triggers
        WHERE trigger_name = 'TRG_NPHIES_ENCOUNTERHOSP_UPD';

        IF v_trigger_exists > 0 THEN
            EXECUTE IMMEDIATE 'DROP TRIGGER trg_nphies_encounterhosp_upd';
        END IF;

        EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER trg_nphies_encounterhosp_upd
            BEFORE UPDATE ON nphiesencounterhospitalization
            FOR EACH ROW
        BEGIN
            :NEW.updated_date := SYSTIMESTAMP;
        END;';

        DBMS_OUTPUT.PUT_LINE('✓ Added timestamp columns and trigger to nphiesencounterhospitalization');
    ELSE
        DBMS_OUTPUT.PUT_LINE('- nphiesencounterhospitalization timestamp columns already exist');
    END IF;

    DBMS_OUTPUT.PUT_LINE('');
    DBMS_OUTPUT.PUT_LINE('========================================');
    DBMS_OUTPUT.PUT_LINE('Timestamp columns addition completed successfully!');
    DBMS_OUTPUT.PUT_LINE('');
    DBMS_OUTPUT.PUT_LINE('Summary:');
    DBMS_OUTPUT.PUT_LINE('- created_date: Added to all tables (set on INSERT)');
    DBMS_OUTPUT.PUT_LINE('- updated_date: Added to all tables except nphies_events (auto-updated on UPDATE)');
    DBMS_OUTPUT.PUT_LINE('- Triggers: Created for all tables with updated_date');
    DBMS_OUTPUT.PUT_LINE('========================================');

EXCEPTION
    WHEN OTHERS THEN
        v_error_message := SQLERRM;
        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('========================================');
        DBMS_OUTPUT.PUT_LINE('ERROR: Timestamp columns addition failed!');
        DBMS_OUTPUT.PUT_LINE('========================================');
        DBMS_OUTPUT.PUT_LINE('Error Message: ' || v_error_message);
        DBMS_OUTPUT.PUT_LINE('Error Code: ' || SQLCODE);
        DBMS_OUTPUT.PUT_LINE('========================================');
        RAISE;
END;
-- End of PL/SQL block