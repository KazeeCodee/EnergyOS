-- fix_t2_sql_helpers_formats.sql

CREATE OR REPLACE FUNCTION public.parse_es_number(val text)
RETURNS numeric
IMMUTABLE STRICT PARALLEL SAFE
LANGUAGE plpgsql
AS $$
BEGIN
    val := trim(val);
    IF val = '' THEN
        RETURN NULL;
    END IF;

    -- Si contiene coma, asumimos que es el separador decimal.
    IF position(',' in val) > 0 THEN
        val := replace(replace(val, '.', ''), ' ', '');
        val := replace(val, ',', '.');
    ELSE
        -- Formato inglés o sin decimales: sacamos espacios.
        val := replace(val, ' ', '');
    END IF;

    RETURN val::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.parse_es_date(val text)
RETURNS date
IMMUTABLE STRICT PARALLEL SAFE
LANGUAGE plpgsql
AS $$
DECLARE
    parts text[];
    y int;
    m int;
    d int;
BEGIN
    val := trim(val);
    IF val = '' THEN
        RETURN NULL;
    END IF;

    -- Normalizar separadores
    val := replace(val, '/', '-');
    
    parts := string_to_array(val, '-');
    IF array_length(parts, 1) = 3 THEN
        d := parts[1]::int;
        m := parts[2]::int;
        y := parts[3]::int;
        
        -- Si el año es de 2 dígitos, sumamos 2000
        -- (asumiendo que los años siempre son >= 2000 en este dataset)
        IF y < 100 THEN
            y := y + 2000;
        END IF;
        
        RETURN make_date(y, m, d);
    END IF;
    
    -- Intento genérico si no coincide con DD-MM-YYYY
    RETURN val::date;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;
