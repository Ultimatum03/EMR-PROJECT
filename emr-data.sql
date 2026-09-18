CREATE DATABASE emr_data;
USE emr_data;

/* Create the patients table */
CREATE TABLE patients (
    patient_id INT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(10) NOT NULL,
    address TEXT NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    marital_status VARCHAR(20)NOT NULL,
    next_of_kin VARCHAR(100) NOT NULL,
    next_of_kin_phone VARCHAR(20) NOT NULL,
    next_of_kin_relationship VARCHAR(50) NOT NULL,
    next_of_kin_address TEXT NOT NULL
);

/* Create the users table */
CREATE TABLE users (
    user_id INT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL
);

/* Create the services table */
CREATE TABLE services (
    service_id INT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    service_description TEXT NOT NULL,
    service_cost DECIMAL(10, 2) NOT NULL
);