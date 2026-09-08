-- Schema only, inspected 2026-09-08. Contains no production rows or credentials.


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

COMMENT ON SCHEMA public IS 'standard public schema';

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.admins (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password text CONSTRAINT admins_password_hash_not_null NOT NULL
);

ALTER TABLE public.admins ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.admins_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.book (
    book_id integer NOT NULL,
    title character varying(255) NOT NULL,
    isbn character varying(20),
    category_id integer NOT NULL,
    description text,
    cover_image character varying(255),
    pdf_file text,
    book_type character varying(10) DEFAULT 'physical'::character varying NOT NULL,
    CONSTRAINT book_type_valid CHECK ((lower((book_type)::text) = ANY (ARRAY['physical'::text, 'digital'::text])))
);

CREATE SEQUENCE public.book_book_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.book_book_id_seq OWNED BY public.book.book_id;

CREATE TABLE public.book_copy (
    copy_id integer NOT NULL,
    barcode character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    book_id integer NOT NULL
);

CREATE SEQUENCE public.book_copy_copy_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.book_copy_copy_id_seq OWNED BY public.book_copy.copy_id;

CREATE TABLE public.cart_items (
    cart_id integer NOT NULL,
    member_id integer NOT NULL,
    book_id integer NOT NULL,
    added_on timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.cart_items_cart_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.cart_items_cart_id_seq OWNED BY public.cart_items.cart_id;

CREATE TABLE public.category (
    category_id integer NOT NULL,
    category_name character varying(100) NOT NULL,
    description text,
    color character varying(20) DEFAULT '#1B4332'::character varying
);

CREATE SEQUENCE public.category_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.category_category_id_seq OWNED BY public.category.category_id;

CREATE TABLE public.issue (
    issue_id integer NOT NULL,
    issue_date date NOT NULL,
    due_date date NOT NULL,
    return_date date,
    member_id integer NOT NULL,
    copy_id integer NOT NULL,
    library_id integer
);

CREATE SEQUENCE public.issue_issue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.issue_issue_id_seq OWNED BY public.issue.issue_id;

CREATE TABLE public.librarian (
    librarian_id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    phone character varying(20)
);

CREATE SEQUENCE public.librarian_librarian_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.librarian_librarian_id_seq OWNED BY public.librarian.librarian_id;

CREATE TABLE public.library (
    library_id integer NOT NULL,
    library_name character varying(100),
    librarian_id integer
);

CREATE SEQUENCE public.library_library_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.library_library_id_seq OWNED BY public.library.library_id;

CREATE TABLE public.member (
    member_id integer NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    phone character varying(20),
    member_type character varying(20) DEFAULT 'Student'::character varying,
    department character varying(100),
    card_no character varying(50),
    roll_id character varying(50),
    dob date,
    address text,
    valid_till date,
    registered_on date DEFAULT CURRENT_DATE,
    status character varying(20) DEFAULT 'Pending'::character varying,
    reset_token character varying(255),
    reset_token_expiry timestamp without time zone,
    role character varying(20) DEFAULT 'member'::character varying NOT NULL,
    CONSTRAINT member_role_check CHECK (((role)::text = 'member'::text))
);

CREATE SEQUENCE public.member_member_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.member_member_id_seq OWNED BY public.member.member_id;

CREATE TABLE public.password_reset (
    reset_id integer NOT NULL,
    email character varying(100) NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE public.password_reset_reset_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.password_reset_reset_id_seq OWNED BY public.password_reset.reset_id;

CREATE TABLE public.wishlist (
    wishlist_id integer NOT NULL,
    member_id integer NOT NULL,
    book_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.wishlist_wishlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.wishlist_wishlist_id_seq OWNED BY public.wishlist.wishlist_id;

ALTER TABLE ONLY public.book ALTER COLUMN book_id SET DEFAULT nextval('public.book_book_id_seq'::regclass);

ALTER TABLE ONLY public.book_copy ALTER COLUMN copy_id SET DEFAULT nextval('public.book_copy_copy_id_seq'::regclass);

ALTER TABLE ONLY public.cart_items ALTER COLUMN cart_id SET DEFAULT nextval('public.cart_items_cart_id_seq'::regclass);

ALTER TABLE ONLY public.category ALTER COLUMN category_id SET DEFAULT nextval('public.category_category_id_seq'::regclass);

ALTER TABLE ONLY public.issue ALTER COLUMN issue_id SET DEFAULT nextval('public.issue_issue_id_seq'::regclass);

ALTER TABLE ONLY public.librarian ALTER COLUMN librarian_id SET DEFAULT nextval('public.librarian_librarian_id_seq'::regclass);

ALTER TABLE ONLY public.library ALTER COLUMN library_id SET DEFAULT nextval('public.library_library_id_seq'::regclass);

ALTER TABLE ONLY public.member ALTER COLUMN member_id SET DEFAULT nextval('public.member_member_id_seq'::regclass);

ALTER TABLE ONLY public.password_reset ALTER COLUMN reset_id SET DEFAULT nextval('public.password_reset_reset_id_seq'::regclass);

ALTER TABLE ONLY public.wishlist ALTER COLUMN wishlist_id SET DEFAULT nextval('public.wishlist_wishlist_id_seq'::regclass);

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.book_copy
    ADD CONSTRAINT book_copy_barcode_key UNIQUE (barcode);

ALTER TABLE ONLY public.book_copy
    ADD CONSTRAINT book_copy_pkey PRIMARY KEY (copy_id);

ALTER TABLE ONLY public.book
    ADD CONSTRAINT book_isbn_key UNIQUE (isbn);

ALTER TABLE ONLY public.book
    ADD CONSTRAINT book_pkey PRIMARY KEY (book_id);

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_member_id_book_id_key UNIQUE (member_id, book_id);

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (cart_id);

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (category_id);

ALTER TABLE ONLY public.issue
    ADD CONSTRAINT issue_pkey PRIMARY KEY (issue_id);

ALTER TABLE ONLY public.librarian
    ADD CONSTRAINT librarian_email_key UNIQUE (email);

ALTER TABLE ONLY public.librarian
    ADD CONSTRAINT librarian_pkey PRIMARY KEY (librarian_id);

ALTER TABLE ONLY public.library
    ADD CONSTRAINT library_pkey PRIMARY KEY (library_id);

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_card_no_key UNIQUE (card_no);

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_email_key UNIQUE (email);

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (member_id);

ALTER TABLE ONLY public.password_reset
    ADD CONSTRAINT password_reset_pkey PRIMARY KEY (reset_id);

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_member_book_unique UNIQUE (member_id, book_id);

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_pkey PRIMARY KEY (wishlist_id);

CREATE UNIQUE INDEX admins_email_lower_unique ON public.admins USING btree (lower((email)::text));

CREATE INDEX book_type_idx ON public.book USING btree (lower((book_type)::text));

CREATE UNIQUE INDEX category_name_lower_unique ON public.category USING btree (lower((category_name)::text));

CREATE INDEX idx_cart_items_member ON public.cart_items USING btree (member_id);

CREATE UNIQUE INDEX librarian_email_lower_unique ON public.librarian USING btree (lower((email)::text));

CREATE UNIQUE INDEX member_email_lower_unique ON public.member USING btree (lower((email)::text));

CREATE INDEX wishlist_member_id_idx ON public.wishlist USING btree (member_id);

ALTER TABLE ONLY public.book
    ADD CONSTRAINT book_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.category(category_id);

ALTER TABLE ONLY public.book_copy
    ADD CONSTRAINT book_copy_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.book(book_id);

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.book(book_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(member_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.issue
    ADD CONSTRAINT issue_copy_id_fkey FOREIGN KEY (copy_id) REFERENCES public.book_copy(copy_id);

ALTER TABLE ONLY public.issue
    ADD CONSTRAINT issue_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.library(library_id);

ALTER TABLE ONLY public.library
    ADD CONSTRAINT library_librarian_id_fkey FOREIGN KEY (librarian_id) REFERENCES public.librarian(librarian_id);

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.book(book_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(member_id) ON DELETE CASCADE;


SET search_path = public;
