-- T2.0 Helpers for parsing CAMMESA raw text

CREATE OR REPLACE FUNCTION public.parse_es_number(val text)
RETURNS numeric
IMMUTABLE STRICT PARALLEL SAFE
LANGUAGE plpgsql
AS $$
BEGIN
    -- Eliminar espacios
    val := trim(val);
    -- Si está vacío retornar nulo
    IF val = '' THEN
        RETURN NULL;
    END IF;
    -- Reemplazar separadores de miles (.) por nada
    val := replace(val, '.', '');
    -- Reemplazar coma decimal (,) por punto (.)
    val := replace(val, ',', '.');
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
BEGIN
    val := trim(val);
    IF val = '' THEN
        RETURN NULL;
    END IF;
    RETURN to_date(val, 'DD/MM/YYYY');
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.nemo_from(val text)
RETURNS text
IMMUTABLE STRICT PARALLEL SAFE
LANGUAGE plpgsql
AS $$
BEGIN
    -- Los NEMO de CAMMESA normalmente ocupan los primeros 8 caracteres
    -- de las descripciones en los txt
    RETURN nullif(trim(left(val, 8)), '');
END;
$$;
